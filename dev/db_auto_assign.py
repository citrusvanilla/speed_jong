#!/usr/bin/env python3
"""
Auto-assign players to tables
Randomly shuffle and assign unassigned players to tables of 4
"""

from setup_firebase import init_firebase
from firebase_admin import firestore
import sys
import random

def auto_assign_players(tournament_id):
    """Auto-assign unassigned players to tables"""
    db = init_firebase()
    
    # Get tournament
    tournament_ref = db.collection('tournaments').document(tournament_id)
    tournament = tournament_ref.get()
    
    if not tournament.exists:
        print(f"❌ Tournament {tournament_id} not found")
        return
    
    t_data = tournament.to_dict()
    print(f"\n🏆 Tournament: {t_data.get('name', 'Unnamed')}")
    
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
    
    num_tables = len(unassigned) // 4
    
    confirm = input(f"\nCreate {num_tables} table(s) from {len(unassigned)} unassigned players? (y/N): ")
    if confirm.lower() != 'y':
        print("Cancelled.")
        return
    
    print(f"\n⏳ Auto-assigning players to {num_tables} table(s)...")
    
    # Shuffle players
    random.shuffle(unassigned)
    
    # Get next table number
    existing_tables = list(db.collection('tournaments', tournament_id, 'tables').stream())
    table_numbers = [t.to_dict().get('tableNumber', 0) for t in existing_tables]
    next_table_num = max(table_numbers) + 1 if table_numbers else 1
    
    positions = ['East', 'South', 'West', 'North']
    
    # Create tables
    for i in range(num_tables):
        table_players = unassigned[i * 4:(i + 1) * 4]
        
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
        
        print(f"   ✅ Table {next_table_num + i}: {', '.join([p['name'] for p in table_players])}")
    
    print(f"\n{'='*50}")
    print(f"✅ Created {num_tables} table(s)!")
    if len(unassigned) % 4 != 0:
        print(f"   {len(unassigned) % 4} player(s) remain unassigned")
    print(f"{'='*50}\n")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("\n🎲 Auto-Assign Players to Tables")
        print("="*50)
        print("Usage:")
        print("  python db_auto_assign.py <tournament-id>")
        print("")
        print("This will:")
        print("  • Find all unassigned, active players")
        print("  • Randomly shuffle them")
        print("  • Create tables of 4 players")
        print("  • Assign positions (East, South, West, North)")
        print("="*50 + "\n")
    else:
        auto_assign_players(sys.argv[1])





