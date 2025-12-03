#!/usr/bin/env python3
"""
Migration script to add roundNumber to existing scoreEvents

This fixes a critical bug where scoreEvents were missing the roundNumber field,
causing round scores and table round scores to calculate as 0.
"""

import firebase_admin
from firebase_admin import credentials, firestore
from datetime import datetime

# Initialize Firebase
if not firebase_admin._apps:
    cred = credentials.Certificate('serviceAccountKey.json')
    firebase_admin.initialize_app(cred)

db = firestore.client()

def fix_scoreevents_for_tournament(tournament_id, dry_run=True):
    """
    Fix scoreEvents by adding roundNumber based on timestamp
    
    Strategy:
    1. Get all rounds for the tournament
    2. For each player, examine their scoreEvents
    3. Match scoreEvent timestamps to round start/end times
    4. Add roundNumber to each scoreEvent
    """
    
    tournament_ref = db.collection('tournaments').document(tournament_id)
    tournament = tournament_ref.get()
    
    if not tournament.exists:
        print(f"Tournament {tournament_id} not found!")
        return
    
    tournament_data = tournament.to_dict()
    print(f"\n{'='*80}")
    print(f"Tournament: {tournament_data.get('name')}")
    print(f"Mode: {'DRY RUN (no changes will be made)' if dry_run else 'LIVE (will update database)'}")
    print(f"{'='*80}\n")
    
    # Get all rounds
    rounds_ref = tournament_ref.collection('rounds')
    rounds = []
    
    for round_doc in rounds_ref.stream():
        round_data = round_doc.to_dict()
        rounds.append({
            'id': round_doc.id,
            'roundNumber': round_data.get('roundNumber'),
            'startedAt': round_data.get('startedAt'),
            'endedAt': round_data.get('endedAt'),
            'status': round_data.get('status')
        })
    
    rounds.sort(key=lambda r: r['roundNumber'])
    
    print(f"Found {len(rounds)} rounds:")
    for r in rounds:
        start = r['startedAt'].strftime('%Y-%m-%d %H:%M:%S') if r['startedAt'] else 'Not started'
        end = r['endedAt'].strftime('%Y-%m-%d %H:%M:%S') if r['endedAt'] else 'Not ended'
        print(f"  Round {r['roundNumber']}: {start} to {end} ({r['status']})")
    
    # Get all players
    players_ref = tournament_ref.collection('players')
    players_updated = 0
    events_fixed = 0
    
    print(f"\nProcessing players...\n")
    
    for player_doc in players_ref.stream():
        player_id = player_doc.id
        player_data = player_doc.to_dict()
        player_name = player_data.get('name', 'Unknown')
        score_events = player_data.get('scoreEvents', [])
        
        if len(score_events) == 0:
            continue
        
        needs_update = False
        updated_events = []
        
        for event in score_events:
            # Check if roundNumber is missing or None
            if event.get('roundNumber') is None:
                # Match timestamp to a round
                event_time = event.get('timestamp')
                matched_round = None
                
                for r in rounds:
                    if r['startedAt'] and event_time:
                        # Event belongs to this round if timestamp is after round start
                        # and (before round end OR round hasn't ended yet)
                        if event_time >= r['startedAt']:
                            if r['endedAt'] is None or event_time <= r['endedAt']:
                                matched_round = r['roundNumber']
                                break
                
                if matched_round is not None:
                    event['roundNumber'] = matched_round
                    needs_update = True
                    events_fixed += 1
                    print(f"  - {player_name}: Event at {event_time.strftime('%H:%M:%S')} → Round {matched_round}")
                else:
                    print(f"  ⚠️  {player_name}: Could not match event at {event_time} to any round!")
            
            updated_events.append(event)
        
        if needs_update:
            players_updated += 1
            
            if not dry_run:
                # Update player document
                player_doc.reference.update({
                    'scoreEvents': updated_events
                })
                print(f"    ✅ Updated player: {player_name}")
    
    # Now fix round participants
    print(f"\nProcessing round participants...\n")
    participants_updated = 0
    
    for round_info in rounds:
        round_id = round_info['id']
        round_number = round_info['roundNumber']
        participants_ref = tournament_ref.collection('rounds').document(round_id).collection('participants')
        
        for participant_doc in participants_ref.stream():
            participant_data = participant_doc.to_dict()
            participant_name = participant_data.get('name', 'Unknown')
            score_events = participant_data.get('scoreEvents', [])
            
            if len(score_events) == 0:
                continue
            
            needs_update = False
            updated_events = []
            
            for event in score_events:
                if event.get('roundNumber') is None:
                    # Participant scoreEvents should all be for THIS round
                    event['roundNumber'] = round_number
                    needs_update = True
                    events_fixed += 1
                
                updated_events.append(event)
            
            if needs_update:
                participants_updated += 1
                
                if not dry_run:
                    participant_doc.reference.update({
                        'scoreEvents': updated_events
                    })
                    print(f"  - Round {round_number} participant: {participant_name}")
    
    print(f"\n{'='*80}")
    print(f"SUMMARY:")
    print(f"  - Players updated: {players_updated}")
    print(f"  - Participants updated: {participants_updated}")
    print(f"  - Score events fixed: {events_fixed}")
    
    if dry_run:
        print(f"\n⚠️  DRY RUN - No changes were made to the database.")
        print(f"Run with --live flag to apply changes.")
    else:
        print(f"\n✅ Database updated successfully!")
    print(f"{'='*80}\n")

if __name__ == '__main__':
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python db_fix_scoreevents.py <tournament_id> [--live] [--yes]")
        print("\nDefault mode is DRY RUN (no changes made)")
        print("Add --live flag to actually update the database")
        print("Add --yes flag to skip confirmation prompt")
        sys.exit(1)
    
    tournament_id = sys.argv[1]
    dry_run = '--live' not in sys.argv
    skip_confirm = '--yes' in sys.argv
    
    if not dry_run and not skip_confirm:
        try:
            confirm = input(f"\n⚠️  You are about to UPDATE the database for tournament {tournament_id}.\nType 'yes' to confirm: ")
            if confirm.lower() != 'yes':
                print("Cancelled.")
                sys.exit(0)
        except (EOFError, KeyboardInterrupt):
            print("\nCancelled.")
            sys.exit(0)
    
    fix_scoreevents_for_tournament(tournament_id, dry_run=dry_run)

