#!/usr/bin/env python3
"""
Auto-assign players to tables with multiple assignment algorithms
1. Random - Randomly shuffle players
2. By Ranking - Top 4 in table 1, next 4 in table 2, etc.
3. Round Robin - Distribute ranks evenly across tables (1,5,9,13 | 2,6,10,14 | etc.)
"""

from setup_firebase import init_firebase
from firebase_admin import firestore
import sys
import random

def sort_players_by_ranking(players):
    """
    Sort players by tournament ranking (for algorithms 2 and 3)
    Sorting criteria (best to worst):
    1. Most wins (descending)
    2. Most points (descending)
    3. Most recent win timestamp (descending)
    4. Name (alphabetically as tie-breaker)
    """
    def get_timestamp(player):
        last_win = player.get('lastWinAt')
        if last_win and hasattr(last_win, 'seconds'):
            return last_win.seconds
        return 0
    
    return sorted(players, key=lambda p: (
        -p.get('wins', 0),
        -p.get('points', 0),
        -get_timestamp(p),
        p.get('name', '')
    ))

def assign_by_algorithm(players, algorithm):
    """
    Assign players to table groups based on selected algorithm
    Returns: List of lists, where each inner list is 4 players for one table
    """
    num_tables = len(players) // 4
    players_to_assign = players[:num_tables * 4]  # Only take players we can seat
    
    if algorithm == 'random':
        # Algorithm 1: Random shuffle
        random.shuffle(players_to_assign)
        return [players_to_assign[i*4:(i+1)*4] for i in range(num_tables)]
    
    elif algorithm == 'ranking':
        # Algorithm 2: By ranking - top 4 in table 1, next 4 in table 2, etc.
        sorted_players = sort_players_by_ranking(players_to_assign)
        return [sorted_players[i*4:(i+1)*4] for i in range(num_tables)]
    
    elif algorithm == 'round_robin':
        # Algorithm 3: Round robin - distribute ranks evenly
        # Rank 1,5,9,13 at table 1, rank 2,6,10,14 at table 2, etc.
        sorted_players = sort_players_by_ranking(players_to_assign)
        tables = [[] for _ in range(num_tables)]
        for i, player in enumerate(sorted_players):
            table_idx = i % num_tables
            tables[table_idx].append(player)
        return tables
    
    else:
        # Default to random
        random.shuffle(players_to_assign)
        return [players_to_assign[i*4:(i+1)*4] for i in range(num_tables)]

def auto_assign_players(tournament_id, algorithm='random'):
    """Auto-assign unassigned players to tables using specified algorithm"""
    db = init_firebase()
    
    # Get tournament
    tournament_ref = db.collection('tournaments').document(tournament_id)
    tournament = tournament_ref.get()
    
    if not tournament.exists:
        print(f"❌ Tournament {tournament_id} not found")
        return
    
    t_data = tournament.to_dict()
    current_round = t_data.get('currentRound', 0)
    print(f"\n🏆 Tournament: {t_data.get('name', 'Unnamed')}")
    print(f"📍 Current Round: {current_round}")
    
    # Get unassigned, non-eliminated players
    players_ref = db.collection('tournaments', tournament_id, 'players')
    all_players = list(players_ref.stream())
    
    unassigned = []
    for p in all_players:
        p_data = p.to_dict()
        if not p_data.get('tableId') and not p_data.get('eliminated', False):
            unassigned.append({'id': p.id, **p_data})
    
    if len(unassigned) == 0:
        print("❌ No unassigned players found")
        return
    
    if len(unassigned) < 4:
        print(f"❌ Only {len(unassigned)} unassigned player(s). Need at least 4 to create a table.")
        return
    
    if len(unassigned) % 4 != 0:
        remainder = len(unassigned) % 4
        print(f"⚠️  Warning: {len(unassigned)} players is not divisible by 4")
        print(f"   {remainder} player(s) will remain unassigned")
    
    # Validate algorithm choice for round 1
    if current_round <= 1 and algorithm in ['ranking', 'round_robin']:
        print(f"⚠️  Warning: '{algorithm}' algorithm not recommended for Round 1 (no rankings yet)")
        print(f"   Falling back to 'random' algorithm")
        algorithm = 'random'
    
    num_tables = len(unassigned) // 4
    
    algorithm_names = {
        'random': 'Random',
        'ranking': 'By Ranking (top 4 per table)',
        'round_robin': 'Round Robin (distribute ranks evenly)'
    }
    
    print(f"\n🎲 Algorithm: {algorithm_names.get(algorithm, algorithm)}")
    confirm = input(f"\nCreate {num_tables} table(s) from {len(unassigned)} unassigned players? (y/N): ")
    if confirm.lower() != 'y':
        print("Cancelled.")
        return
    
    print(f"\n⏳ Auto-assigning players to {num_tables} table(s)...")
    
    # Assign players using selected algorithm
    table_assignments = assign_by_algorithm(unassigned, algorithm)
    
    # Get next table number
    existing_tables = list(db.collection('tournaments', tournament_id, 'tables').stream())
    table_numbers = [t.to_dict().get('tableNumber', 0) for t in existing_tables]
    next_table_num = max(table_numbers) + 1 if table_numbers else 1
    
    positions = ['East', 'South', 'West', 'North']
    
    # Create tables using assigned groups
    for i, table_players in enumerate(table_assignments):
        # Create table
        table_ref = db.collection('tournaments', tournament_id, 'tables').document()
        table_id = table_ref.id
        
        player_ids = [p['id'] for p in table_players]
        positions_map = {p['id']: positions[j] for j, p in enumerate(table_players)}
        
        table_ref.set({
            'tableNumber': next_table_num + i,
            'players': player_ids,
            'positions': positions_map,
            'createdAt': firestore.SERVER_TIMESTAMP
        })
        
        # Update players
        for j, player in enumerate(table_players):
            db.collection('tournaments', tournament_id, 'players').document(player['id']).update({
                'tableId': table_id,
                'position': positions[j]
            })
        
        # Show table assignment with ranking info if using ranking algorithms
        player_info = []
        for p in table_players:
            wins = p.get('wins', 0)
            if algorithm in ['ranking', 'round_robin'] and wins > 0:
                player_info.append(f"{p['name']} ({wins}W)")
            else:
                player_info.append(p['name'])
        
        print(f"   ✅ Table {next_table_num + i}: {', '.join(player_info)}")
    
    print(f"\n{'='*50}")
    print(f"✅ Created {num_tables} table(s) using '{algorithm_names.get(algorithm, algorithm)}' algorithm!")
    if len(unassigned) % 4 != 0:
        print(f"   {len(unassigned) % 4} player(s) remain unassigned")
    print(f"{'='*50}\n")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("\n🎲 Auto-Assign Players to Tables")
        print("="*50)
        print("Usage:")
        print("  python db_auto_assign.py <tournament-id> [algorithm]")
        print("")
        print("Algorithms:")
        print("  random       - Randomly shuffle players (default)")
        print("  ranking      - Top 4 in table 1, next 4 in table 2, etc.")
        print("  round_robin  - Distribute ranks evenly across tables")
        print("")
        print("Examples:")
        print("  python db_auto_assign.py abc123")
        print("  python db_auto_assign.py abc123 random")
        print("  python db_auto_assign.py abc123 ranking")
        print("  python db_auto_assign.py abc123 round_robin")
        print("")
        print("Note: 'ranking' and 'round_robin' are not recommended")
        print("      for Round 1 (no player rankings yet)")
        print("="*50 + "\n")
    else:
        tournament_id = sys.argv[1]
        algorithm = sys.argv[2] if len(sys.argv) > 2 else 'random'
        
        if algorithm not in ['random', 'ranking', 'round_robin']:
            print(f"❌ Unknown algorithm: '{algorithm}'")
            print("   Valid options: random, ranking, round_robin")
            sys.exit(1)
        
        auto_assign_players(tournament_id, algorithm)





