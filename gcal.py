import os
import logging
from typing import Optional
from datetime import datetime

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
import google.auth.transport.requests

import db
from config import TZ

logger = logging.getLogger("dyzury_bot")

SCOPES = ['https://www.googleapis.com/auth/calendar.events']

def _get_client_config():
    client_id = os.environ.get("GOOGLE_CLIENT_ID")
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET")
    if not client_id or not client_secret:
        return None
    return {
        "web": {
            "client_id": client_id,
            "project_id": "medapp",
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
            "client_secret": client_secret,
        }
    }

def get_auth_flow(redirect_uri: str) -> Optional[Flow]:
    config = _get_client_config()
    if not config:
        return None
    flow = Flow.from_client_config(
        config,
        scopes=SCOPES,
        redirect_uri=redirect_uri
    )
    return flow

async def get_credentials(user_id: int) -> Optional[Credentials]:
    profile = await db.get_profile(user_id)
    if not profile.gcal_access_token or not profile.gcal_refresh_token:
        return None
        
    config = _get_client_config()
    if not config:
        return None

    creds = Credentials(
        token=profile.gcal_access_token,
        refresh_token=profile.gcal_refresh_token,
        token_uri=config["web"]["token_uri"],
        client_id=config["web"]["client_id"],
        client_secret=config["web"]["client_secret"],
        scopes=SCOPES
    )

    if creds.expired and creds.refresh_token:
        try:
            req = google.auth.transport.requests.Request()
            creds.refresh(req)
            # Save new access token
            await db.update_profile(
                user_id,
                gcal_access_token=creds.token,
                gcal_expiry=None # We aren't strictly tracking expiry datetime, python google auth handles it via expiration property but we need it for DB if we want.
            )
        except Exception as e:
            logger.error("Failed to refresh Google credentials for user %s: %s", user_id, e)
            return None

    return creds

async def disconnect(user_id: int):
    await db.update_profile(
        user_id,
        gcal_access_token=None,
        gcal_refresh_token=None,
        gcal_expiry=None
    )

async def sync_entry(entry: db.Entry, is_deleted: bool = False):
    creds = await get_credentials(entry.user_id)
    if not creds:
        return

    try:
        service = build('calendar', 'v3', credentials=creds)
        
        if is_deleted:
            if entry.gcal_event_id:
                try:
                    service.events().delete(calendarId='primary', eventId=entry.gcal_event_id).execute()
                except Exception as e:
                    logger.warning("Failed to delete event %s: %s", entry.gcal_event_id, e)
            return

        # Not deleted, we need to create or update
        kind_label = "Дежурство" if entry.kind == "dyzur" else "Смена"
        summary = f"{kind_label}: {entry.oddzial}"
        
        # We need end_dt. If the shift is open (no end_ts), we assume it ends in 1 hour for now just to have a visual block in calendar, or 12 hours for dyzur
        end_dt = entry.end_dt
        if not end_dt:
            from datetime import timedelta
            end_dt = entry.start_dt + timedelta(hours=24 if entry.kind == "dyzur" else 8)

        event_body = {
            'summary': summary,
            'start': {
                'dateTime': entry.start_dt.isoformat(),
                'timeZone': TZ.zone,
            },
            'end': {
                'dateTime': end_dt.isoformat(),
                'timeZone': TZ.zone,
            },
        }

        if entry.gcal_event_id:
            # Update existing
            try:
                service.events().update(calendarId='primary', eventId=entry.gcal_event_id, body=event_body).execute()
            except Exception as e:
                logger.warning("Failed to update event %s (maybe deleted manually?): %s", entry.gcal_event_id, e)
                # If not found (404), maybe create a new one? For now, just pass.
        else:
            # Create new
            event = service.events().insert(calendarId='primary', body=event_body).execute()
            new_id = event.get('id')
            if new_id:
                await db.update_entry_gcal(entry.id, entry.user_id, new_id)
                entry.gcal_event_id = new_id

    except Exception as e:
        logger.error("Failed to sync entry %s to Google Calendar: %s", entry.id, e)

async def get_upcoming_events(user_id: int, limit: int = 5) -> list[dict]:
    creds = await get_credentials(user_id)
    if not creds:
        return []

    try:
        service = build('calendar', 'v3', credentials=creds)
        now = datetime.utcnow().isoformat() + 'Z'  # 'Z' indicates UTC time
        events_result = service.events().list(
            calendarId='primary', timeMin=now,
            maxResults=limit, singleEvents=True,
            orderBy='startTime'
        ).execute()
        events = events_result.get('items', [])
        
        result = []
        for event in events:
            # Handle all-day events (date instead of dateTime)
            start_str = event['start'].get('dateTime') or event['start'].get('date')
            end_str = event['end'].get('dateTime') or event['end'].get('date')
            if not start_str:
                continue
                
            try:
                start_dt = datetime.fromisoformat(start_str.replace('Z', '+00:00'))
                # If it's an all-day event, we might get just 'YYYY-MM-DD'. fromisoformat handles this.
            except Exception:
                continue
                
            result.append({
                'id': event['id'],
                'summary': event.get('summary', 'Wydarzenie'),
                'start_dt': start_dt,
            })
        return result
    except Exception as e:
        logger.error("Failed to fetch upcoming events from Google Calendar: %s", e)
        return []
