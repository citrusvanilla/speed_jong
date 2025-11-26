#!/usr/bin/env python3
"""
Create Tournament
Quickly create a new tournament via command line
"""

from setup_firebase import init_firebase
from firebase_admin import firestore
import sys

def create_tournament(name, tournament_type='standard', timer_duration=5, max_players=0, total_rounds=0):
    """Create a new tournament"""
    db = init_firebase()
    
    tournament_data = {
        'name': name,
        'type': tournament_type,
        'timerDuration': timer_duration,
        'maxPlayers': max_players,
        'totalRounds': total_rounds,
        'status': 'staging',
        'currentRound': 0,
        'roundInProgress': False,
        'createdAt': firestore.SERVER_TIMESTAMP
    }
    
    print(f"\n🏆 Creating tournament: {name}")
    print(f"   Type: {tournament_type}")
    print(f"   Timer: {timer_duration}s")
    print(f"   Max Players: {max_players if max_players > 0 else 'Unlimited'}")
    if tournament_type == 'cutline' and total_rounds > 0:
        print(f"   Total Rounds: {total_rounds}")
    
    tournament_ref = db.collection('tournaments').document()
    tournament_ref.set(tournament_data)
    
    print(f"\n✅ Tournament created!")
    print(f"   ID: {tournament_ref.id}")
    print(f"\nUse this ID to import players:")
    print(f"   python db_bulk_import.py import {tournament_ref.id} players.csv")
    print("")
    
    return tournament_ref.id

def main():
    if len(sys.argv) < 2:
        print_usage()
        return
    
    name = sys.argv[1]
    tournament_type = sys.argv[2] if len(sys.argv) > 2 else 'standard'
    timer_duration = int(sys.argv[3]) if len(sys.argv) > 3 else 5
    max_players = int(sys.argv[4]) if len(sys.argv) > 4 else 0
    total_rounds = int(sys.argv[5]) if len(sys.argv) > 5 else 0
    
    if tournament_type == 'cutline' and total_rounds == 0:
        print("❌ Error: Cut line tournaments require total_rounds > 0")
        print_usage()
        return
    
    create_tournament(name, tournament_type, timer_duration, max_players, total_rounds)

def print_usage():
    print("\n🏆 Create Tournament Utility")
    print("="*50)
    print("Usage:")
    print("  python create_tournament.py <name> [type] [timer] [max_players] [total_rounds]")
    print("")
    print("Arguments:")
    print("  name           Tournament name (required)")
    print("  type           'standard' or 'cutline' (default: standard)")
    print("  timer          Timer duration in seconds (default: 5)")
    print("  max_players    Max players, 0=unlimited (default: 0)")
    print("  total_rounds   Total rounds (required for cutline)")
    print("")
    print("Examples:")
    print("  # Standard tournament")
    print("  python create_tournament.py 'Spring 2024'")
    print("")
    print("  # Standard with 8-second timer and 40 player limit")
    print("  python create_tournament.py 'Summer League' standard 8 40")
    print("")
    print("  # Cut line tournament with 4 rounds")
    print("  python create_tournament.py 'Championship' cutline 5 60 4")
    print("="*50 + "\n")

if __name__ == "__main__":
    main()

