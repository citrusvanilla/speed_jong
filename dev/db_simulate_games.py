#!/usr/bin/env python3
"""
Simulate Games for Testing
Randomly simulate games for a tournament round to generate realistic test data
"""

from setup_firebase import init_firebase
from firebase_admin import firestore
import sys
import random
from datetime import datetime, timedelta

def simulate_round_games(tournament_id, min_games_per_table=4, max_games_per_table=6):
    """Simulate random game results for all tables in current round"""
    db = init_firebase()
    
    tournament_ref = db.collection('tournaments').document(tournament_id)
    tournament = tournament_ref.get()
    
    if not tournament.exists:
        print(f"❌ Tournament {tournament_id} not found")
        return
    
    t_data = tournament.to_dict()
    current_round = t_data.get('currentRound', 0)
    round_in_progress = t_data.get('roundInProgress', False)
    
    if current_round == 0:
        print("❌ No round has been started yet")
        return
    
    if not round_in_progress:
        print(f"❌ Round {current_round} is not in progress")
        return
    
    print(f"\n🎲 Simulating games for Round {current_round} of '{t_data.get('name', 'Unnamed')}'")
    
    # Get all tables
    tables = list(db.collection('tournaments', tournament_id, 'tables').stream())
    
    if len(tables) == 0:
        print("❌ No tables found. Assign players to tables first.")
        return
    
    print(f"   Found {len(tables)} table(s)")
    
    confirm = input(f"\nSimulate {min_games_per_table}-{max_games_per_table} games per table? (y/N): ")
    if confirm.lower() != 'y':
        print("Cancelled.")
        return
    
    print(f"\n⏳ Simulating games...")
    
    base_time = datetime.now() - timedelta(hours=1)  # Start 1 hour ago
    current_time = base_time
    
    total_games = 0
    
    # Find current round doc once
    rounds = list(db.collection('tournaments', tournament_id, 'rounds').stream())
    round_doc_id = None
    for round_doc in rounds:
        round_data = round_doc.to_dict()
        if round_data.get('roundNumber') == current_round and round_data.get('status') == 'in_progress':
            round_doc_id = round_doc.id
            break
    
    if not round_doc_id:
        print(f"❌ Could not find round {current_round} document")
        return
    
    # Build participant ID map once
    participant_map = {}  # playerId -> participantDocId
    participants = list(db.collection('tournaments', tournament_id, 'rounds', round_doc_id, 'participants').stream())
    for participant_doc in participants:
        p_data = participant_doc.to_dict()
        participant_map[p_data.get('playerId')] = participant_doc.id
    
    for table_doc in tables:
        table_data = table_doc.to_dict()
        table_number = table_data.get('tableNumber', '?')
        player_ids = table_data.get('players', [])
        
        if len(player_ids) != 4:
            print(f"   ⚠️ Table {table_number}: {len(player_ids)} players (skipping)")
            continue
        
        num_games = random.randint(min_games_per_table, max_games_per_table)
        
        print(f"   Table {table_number}: Simulating {num_games} games...")
        
        for game in range(num_games):
            # Pick random winner
            winner_id = random.choice(player_ids)
            
            # Advance time by 3-8 minutes per game
            current_time += timedelta(minutes=random.randint(3, 8))
            
            # Update player only (participants are immutable snapshots)
            player_ref = db.collection('tournaments', tournament_id, 'players').document(winner_id)
            player_ref.update({
                'wins': firestore.Increment(1),
                'lastWinAt': current_time
            })
            
            total_games += 1
    
    print(f"\n{'='*50}")
    print(f"✅ Simulated {total_games} game(s) across {len(tables)} table(s)")
    print(f"   Time span: {base_time.strftime('%H:%M')} - {current_time.strftime('%H:%M')}")
    print(f"{'='*50}\n")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("\n🎲 Simulate Round Games")
        print("="*50)
        print("Usage:")
        print("  python db_simulate_games.py <tournament-id> [min-games] [max-games]")
        print("")
        print("Arguments:")
        print("  tournament-id    Tournament ID")
        print("  min-games       Min games per table (default: 4)")
        print("  max-games       Max games per table (default: 6)")
        print("")
        print("Example:")
        print("  python db_simulate_games.py abc123")
        print("  python db_simulate_games.py abc123 5 8")
        print("")
        print("Note: Current round must be in progress and tables must be assigned")
        print("="*50 + "\n")
    else:
        tournament_id = sys.argv[1]
        min_games = int(sys.argv[2]) if len(sys.argv) > 2 else 4
        max_games = int(sys.argv[3]) if len(sys.argv) > 3 else 6
        simulate_round_games(tournament_id, min_games, max_games)

