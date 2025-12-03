#!/usr/bin/env python3
"""
Import Complete Tournament State from JSON
Restore a tournament to exact state from exported JSON
"""

from setup_firebase import init_firebase
from firebase_admin import firestore
import json
import sys
from datetime import datetime

def import_tournament_state(json_file, new_tournament_id=None):
    """Import complete tournament state from JSON"""
    db = init_firebase()
    
    # Read JSON file
    try:
        with open(json_file, 'r') as f:
            import_data = json.load(f)
    except FileNotFoundError:
        print(f"❌ File not found: {json_file}")
        return
    except json.JSONDecodeError as e:
        print(f"❌ Invalid JSON file: {e}")
        return
    
    print(f"\n📥 Importing tournament state from: {json_file}")
    print(f"   Exported: {import_data.get('exported_at', 'Unknown')}")
    
    tournament_data = import_data['tournament']
    print(f"\n🏆 Tournament: {tournament_data.get('name', 'Unnamed')}")
    print(f"   Players: {len(import_data['players'])}")
    print(f"   Tables: {len(import_data['tables'])}")
    print(f"   Rounds: {len(import_data['rounds'])}")
    
    confirm = input("\nProceed with import? This will create a new tournament. (y/N): ")
    if confirm.lower() != 'y':
        print("Cancelled.")
        return
    
    # Create new tournament or use specified ID
    if new_tournament_id:
        tournament_ref = db.collection('tournaments').document(new_tournament_id)
    else:
        tournament_ref = db.collection('tournaments').document()
    
    tournament_id = tournament_ref.id
    
    print(f"\n⏳ Creating tournament: {tournament_id}")
    
    # Convert ISO strings back to timestamps where needed
    def convert_iso_to_timestamp(obj):
        if isinstance(obj, dict):
            result = {}
            for k, v in obj.items():
                if k in ['createdAt', 'startedAt', 'endedAt', 'registeredAt', 'lastWinAt', 'snapshotAt']:
                    if v and isinstance(v, str):
                        # Use server timestamp for current time, or skip for null
                        result[k] = firestore.SERVER_TIMESTAMP if v else None
                    else:
                        result[k] = v
                else:
                    result[k] = convert_iso_to_timestamp(v)
            return result
        elif isinstance(obj, list):
            return [convert_iso_to_timestamp(item) for item in obj]
        else:
            return obj
    
    try:
        # Create tournament
        clean_tournament = convert_iso_to_timestamp(tournament_data)
        tournament_ref.set(clean_tournament)
        print(f"   ✅ Tournament created")
        
        # Create players
        print(f"\n⏳ Creating {len(import_data['players'])} players...")
        player_id_map = {}  # Map old IDs to new IDs
        for player_data in import_data['players']:
            old_id = player_data['id']
            clean_player = {k: v for k, v in player_data.items() if k != 'id'}
            clean_player = convert_iso_to_timestamp(clean_player)
            
            player_ref = db.collection('tournaments', tournament_id, 'players').document()
            player_ref.set(clean_player)
            player_id_map[old_id] = player_ref.id
        print(f"   ✅ {len(import_data['players'])} players created")
        
        # Create tables (update player references)
        print(f"\n⏳ Creating {len(import_data['tables'])} tables...")
        table_id_map = {}
        for table_data in import_data['tables']:
            old_id = table_data['id']
            clean_table = {k: v for k, v in table_data.items() if k != 'id'}
            clean_table = convert_iso_to_timestamp(clean_table)
            
            # Update player IDs in table
            if 'players' in clean_table:
                clean_table['players'] = [player_id_map.get(pid, pid) for pid in clean_table['players']]
            if 'positions' in clean_table:
                clean_table['positions'] = {player_id_map.get(pid, pid): pos for pid, pos in clean_table['positions'].items()}
            
            table_ref = db.collection('tournaments', tournament_id, 'tables').document()
            table_ref.set(clean_table)
            table_id_map[old_id] = table_ref.id
        print(f"   ✅ {len(import_data['tables'])} tables created")
        
        # Update players with new table IDs
        print(f"\n⏳ Updating player table assignments...")
        for player_data in import_data['players']:
            old_player_id = player_data['id']
            new_player_id = player_id_map[old_player_id]
            
            if player_data.get('tableId'):
                old_table_id = player_data['tableId']
                new_table_id = table_id_map.get(old_table_id)
                if new_table_id:
                    db.collection('tournaments', tournament_id, 'players').document(new_player_id).update({
                        'tableId': new_table_id
                    })
        
        # Create rounds with participants
        print(f"\n⏳ Creating {len(import_data['rounds'])} rounds...")
        for round_data in import_data['rounds']:
            clean_round = {k: v for k, v in round_data.items() if k not in ['id', 'participants']}
            clean_round = convert_iso_to_timestamp(clean_round)
            
            round_ref = db.collection('tournaments', tournament_id, 'rounds').document()
            round_ref.set(clean_round)
            
            # Create participants
            for participant_data in round_data['participants']:
                clean_participant = {k: v for k, v in participant_data.items() if k != 'id'}
                clean_participant = convert_iso_to_timestamp(clean_participant)
                
                # Update player ID reference
                if 'playerId' in clean_participant:
                    old_player_id = clean_participant['playerId']
                    clean_participant['playerId'] = player_id_map.get(old_player_id, old_player_id)
                
                # Update table ID reference
                if 'tableId' in clean_participant and clean_participant['tableId']:
                    old_table_id = clean_participant['tableId']
                    clean_participant['tableId'] = table_id_map.get(old_table_id, old_table_id)
                
                participant_ref = db.collection('tournaments', tournament_id, 'rounds', round_ref.id, 'participants').document()
                participant_ref.set(clean_participant)
        
        print(f"   ✅ {len(import_data['rounds'])} rounds created")
        
        print(f"\n{'='*50}")
        print(f"✅ Tournament state imported successfully!")
        print(f"   New Tournament ID: {tournament_id}")
        print(f"{'='*50}\n")
        
        return tournament_id
        
    except Exception as e:
        print(f"\n❌ Error during import: {e}")
        print(f"   You may need to manually clean up tournament: {tournament_id}")
        return None

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("\n📥 Import Tournament State")
        print("="*50)
        print("Usage:")
        print("  python db_import_state.py <json-file> [new-tournament-id]")
        print("")
        print("Arguments:")
        print("  json-file           Path to exported JSON file")
        print("  new-tournament-id   Optional: specify tournament ID (default: auto-generate)")
        print("")
        print("Example:")
        print("  python db_import_state.py exports/my_tournament.json")
        print("  python db_import_state.py backup.json custom-id-123")
        print("="*50 + "\n")
    else:
        json_file = sys.argv[1]
        new_id = sys.argv[2] if len(sys.argv) > 2 else None
        import_tournament_state(json_file, new_id)





