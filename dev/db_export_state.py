#!/usr/bin/env python3
"""
Export Complete Tournament State to JSON
Exports everything needed to restore a tournament to exact state
"""

from setup_firebase import init_firebase
import json
from datetime import datetime
import sys

def export_tournament_state(tournament_id, output_file=None):
    """Export complete tournament state including all subcollections"""
    db = init_firebase()
    
    tournament_ref = db.collection('tournaments').document(tournament_id)
    tournament = tournament_ref.get()
    
    if not tournament.exists:
        print(f"❌ Tournament {tournament_id} not found")
        return None
    
    t_data = tournament.to_dict()
    
    # Convert Firestore timestamps to ISO strings
    def convert_timestamp(obj):
        if isinstance(obj, dict):
            return {k: convert_timestamp(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [convert_timestamp(item) for item in obj]
        elif hasattr(obj, 'isoformat'):
            return obj.isoformat()
        else:
            return obj
    
    print(f"\n📦 Exporting tournament state: {t_data.get('name', 'Unnamed')}")
    
    export_data = {
        'export_version': '1.0',
        'exported_at': datetime.now().isoformat(),
        'tournament_id': tournament_id,
        'tournament': convert_timestamp(t_data),
        'players': [],
        'tables': [],
        'rounds': []
    }
    
    # Export all players
    players = list(db.collection('tournaments', tournament_id, 'players').stream())
    print(f"   Exporting {len(players)} players...")
    for player in players:
        export_data['players'].append({
            'id': player.id,
            **convert_timestamp(player.to_dict())
        })
    
    # Export all tables
    tables = list(db.collection('tournaments', tournament_id, 'tables').stream())
    print(f"   Exporting {len(tables)} tables...")
    for table in tables:
        export_data['tables'].append({
            'id': table.id,
            **convert_timestamp(table.to_dict())
        })
    
    # Export all rounds with participants
    rounds = list(db.collection('tournaments', tournament_id, 'rounds').stream())
    print(f"   Exporting {len(rounds)} rounds...")
    for round_doc in rounds:
        round_data = {
            'id': round_doc.id,
            **convert_timestamp(round_doc.to_dict()),
            'participants': []
        }
        
        # Export participants
        participants = list(db.collection('tournaments', tournament_id, 'rounds', round_doc.id, 'participants').stream())
        for participant in participants:
            round_data['participants'].append({
                'id': participant.id,
                **convert_timestamp(participant.to_dict())
            })
        
        export_data['rounds'].append(round_data)
    
    # Save to file
    if output_file is None:
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        safe_name = t_data.get('name', 'tournament').replace(' ', '_').lower()
        output_file = f"exports/{safe_name}_{timestamp}.json"
    
    import os
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    
    with open(output_file, 'w') as f:
        json.dump(export_data, f, indent=2)
    
    print(f"\n✅ Exported complete state to: {output_file}")
    print(f"   Players: {len(export_data['players'])}")
    print(f"   Tables: {len(export_data['tables'])}")
    print(f"   Rounds: {len(export_data['rounds'])}")
    total_participants = sum(len(r['participants']) for r in export_data['rounds'])
    print(f"   Participants: {total_participants}")
    print()
    
    return output_file

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("\n📦 Export Tournament State")
        print("="*50)
        print("Usage:")
        print("  python db_export_state.py <tournament-id> [output-file]")
        print("")
        print("Example:")
        print("  python db_export_state.py abc123")
        print("  python db_export_state.py abc123 my_backup.json")
        print("="*50 + "\n")
    else:
        tournament_id = sys.argv[1]
        output_file = sys.argv[2] if len(sys.argv) > 2 else None
        export_tournament_state(tournament_id, output_file)





