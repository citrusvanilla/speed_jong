#!/usr/bin/env python3
"""
Firebase Admin SDK Setup
Initialize the Firebase Admin SDK for server-side operations
"""

import firebase_admin
from firebase_admin import credentials, firestore

# Initialize Firebase Admin SDK
# You'll need to download a service account key from Firebase Console:
# Project Settings > Service Accounts > Generate New Private Key
# Save it as 'serviceAccountKey.json' in this directory

def init_firebase():
    """Initialize Firebase Admin SDK"""
    try:
        # Try to initialize (will fail if already initialized)
        cred = credentials.Certificate('serviceAccountKey.json')
        firebase_admin.initialize_app(cred)
        print("✅ Firebase Admin SDK initialized")
    except ValueError:
        # Already initialized
        print("ℹ️  Firebase Admin SDK already initialized")
    
    return firestore.client()

if __name__ == "__main__":
    db = init_firebase()
    print(f"✅ Connected to Firestore")
    print(f"Database: {db.project}")

