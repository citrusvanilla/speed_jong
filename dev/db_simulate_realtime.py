#!/usr/bin/env python3
"""
Real-Time Round Simulation
Simulates games over a specified duration, updating Firebase live
so you can watch the leaderboard update in real-time
"""

from setup_firebase import init_firebase
from firebase_admin import firestore
import sys
import random
import time
from datetime import datetime, timedelta

def simulate_round_realtime(tournament_id, duration_seconds=15, simulated_minutes=30):
    """
    Simulate a round in real-time
    
    Args:
        tournament_id: Tournament ID
        duration_seconds: How long the simulation runs in real time (e.g., 15 seconds)
        simulated_minutes: Display value for how much "game time" this represents (for info only)
    """
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
    
    print(f"\n🎲 Real-Time Simulation for '{t_data.get('name', 'Unnamed')}'")
    print(f"   Round: {current_round}")
    print(f"   Duration: {duration_seconds} seconds (simulates {simulated_minutes} min)")
    
    # Get all tables
    tables = list(db.collection('tournaments', tournament_id, 'tables').stream())
    
    if len(tables) == 0:
        print("❌ No tables found")
        return
    
    print(f"   Tables: {len(tables)}")
    
    # Generate game schedule for each table
    game_schedule = []  # List of (timestamp, table_id, player_id)
    
    for table_doc in tables:
        table_data = table_doc.to_dict()
        table_number = table_data.get('tableNumber', '?')
        player_ids = table_data.get('players', [])
        
        if len(player_ids) != 4:
            print(f"   ⚠️ Table {table_number}: {len(player_ids)} players (skipping)")
            continue
        
        num_games = random.randint(4, 6)
        
        # Schedule games evenly over the duration
        for game_idx in range(num_games):
            # Real-time: when during the simulation this game happens
            progress = (game_idx + 1) / (num_games + 1)  # Spread evenly, not at endpoints
            real_timestamp = time.time() + (progress * duration_seconds)
            
            # Pick random winner
            winner_id = random.choice(player_ids)
            
            game_schedule.append({
                'real_time': real_timestamp,
                'table_id': table_doc.id,
                'table_number': table_number,
                'player_id': winner_id
            })
    
    # Bucket games into 0.1 second intervals
    bucket_size = 0.1
    buckets = {}
    
    for game in game_schedule:
        bucket_time = round(game['real_time'] / bucket_size) * bucket_size
        if bucket_time not in buckets:
            buckets[bucket_time] = []
        buckets[bucket_time].append(game)
    
    # Sort buckets by time
    sorted_buckets = sorted(buckets.items())
    
    total_games = len(game_schedule)
    print(f"\n🎮 Scheduled {total_games} games in {len(sorted_buckets)} buckets over {duration_seconds} seconds")
    print(f"   Simulated time span: {simulated_minutes} minutes")
    print(f"   Bucket size: {bucket_size}s")
    print(f"\n⏳ Starting simulation...\n")
    
    start_time = time.time()
    games_played = 0
    
    for bucket_time, games in sorted_buckets:
        # Wait until it's time for this bucket
        now = time.time()
        wait_time = bucket_time - now
        
        if wait_time > 0:
            time.sleep(wait_time)
        
        # Process all games in this bucket
        elapsed = time.time() - start_time
        
        for game in games:
            # Record the win (use server timestamp for accurate current time)
            player_ref = db.collection('tournaments', tournament_id, 'players').document(game['player_id'])
            player_ref.update({
                'wins': firestore.Increment(1),
                'lastWinAt': firestore.SERVER_TIMESTAMP
            })
            
            games_played += 1
            
            # Get player name for display
            player_data = player_ref.get().to_dict()
            player_name = player_data.get('name', 'Unknown')
            
            print(f"   [{elapsed:5.1f}s] Table {game['table_number']}: {player_name} wins! ({games_played}/{total_games})")
    
    elapsed_total = time.time() - start_time
    
    print(f"\n{'='*60}")
    print(f"✅ Simulation complete!")
    print(f"   Real time: {elapsed_total:.1f} seconds")
    print(f"   Games played: {games_played}")
    print(f"   Simulated time: {simulated_minutes} minutes")
    print(f"{'='*60}\n")

def main():
    if len(sys.argv) < 2:
        print("\n🎬 Real-Time Round Simulation")
        print("="*60)
        print("Usage:")
        print("  python db_simulate_realtime.py <tournament-id> [duration] [simulated-minutes]")
        print("")
        print("Arguments:")
        print("  tournament-id       Tournament ID")
        print("  duration           Real-time duration in seconds (default: 15)")
        print("  simulated-minutes  Simulated time span in minutes (default: 30)")
        print("")
        print("Example:")
        print("  python db_simulate_realtime.py abc123 15 30")
        print("  (Runs for 15 seconds, simulates 30 minutes of gameplay)")
        print("")
        print("Note:")
        print("  - Keep the leaderboard open to watch updates in real-time!")
        print("  - Round must already be in progress")
        print("  - Tables must be assigned")
        print("="*60 + "\n")
    else:
        tournament_id = sys.argv[1]
        duration = int(sys.argv[2]) if len(sys.argv) > 2 else 15
        simulated_minutes = int(sys.argv[3]) if len(sys.argv) > 3 else 30
        simulate_round_realtime(tournament_id, duration, simulated_minutes)

if __name__ == "__main__":
    main()

