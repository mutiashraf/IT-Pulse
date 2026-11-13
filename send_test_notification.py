
import json
import os
import sys

import requests
from google.auth.transport.requests import Request
from google.oauth2 import service_account

PROJECT_ID = "it-pulse-5a341"
SCOPES = ["https://www.googleapis.com/auth/firebase.messaging"]


def main():
    service_account_json = os.environ["FIREBASE_SERVICE_ACCOUNT_JSON"]
    device_token = os.environ["FCM_DEVICE_TOKEN"]

    service_account_info = json.loads(service_account_json)

    credentials = service_account.Credentials.from_service_account_info(
        service_account_info,
        scopes=SCOPES
    )
    credentials.refresh(Request())

    url = (
        f"https://fcm.googleapis.com/v1/projects/"
        f"{PROJECT_ID}/messages:send"
    )

    payload = {
        "message": {
            "token": device_token,
            "notification": {
                "title": "IT Pulse - Test Alert",
                "body": "Success! Your GitHub Actions notification system is working."
            }
        }
    }

    response = requests.post(
        url,
        headers={
            "Authorization": f"Bearer {credentials.token}",
            "Content-Type": "application/json"
        },
        json=payload,
        timeout=30
    )

    if response.ok:
        print("SUCCESS: Firebase accepted the notification.")
        print(response.text)
    else:
        print(f"ERROR: Firebase returned HTTP {response.status_code}")
        print(response.text)
        sys.exit(1)


if __name__ == "__main__":
    main()
