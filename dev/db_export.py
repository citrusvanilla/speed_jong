#!/usr/bin/env python3
"""
Database Export/Backup
Export your Firebase data to JSON for backup
"""

from setup_firebase import init_firebase
import json
from datetime import datetime

def export_tournament(tournament_id, output_file=None):
    """Export a specific tournament to JSON"""
    db = init_firebase()
    
    tournament_ref = db.collection('tournaments').document(tournament_id)
    tournament = tournament_ref.get()
    
    if not tournament.exists:
        print(f"❌ Tournament {tournament_id} not found")
        return
    
    t_data = tournament.to_dict()
    
    # Convert Firestore timestamps to strings
    def convert_timestamps(obj):
        if isinstance(obj, dict):
            return {k: convert_timestamps(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [convert_timestamps(item) for item in obj]
        elif hasattr(obj, 'isoformat'):  # datetime/timestamp
            return obj.isoformat()
        else:
            return obj
    
    export_data = {
        'tournament': convert_timestamps(t_data),
        'tournament_id': tournament_id,
        'exported_at': datetime.now().isoformat(),
        'players': [],
        'tables': [],
        'rounds': []
    }
    
    # Export players
    players = list(db.collection('tournaments', tournament_id, 'players').stream())
    for player in players:
        export_data['players'].append({
            'id': player.id,
            **convert_timestamps(player.to_dict())
        })
    
    # Export tables
    tables = list(db.collection('tournaments', tournament_id, 'tables').stream())
    for table in tables:
        export_data['tables'].append({
            'id': table.id,
            **convert_timestamps(table.to_dict())
        })
    
    # Export rounds
    rounds = list(db.collection('tournaments', tournament_id, 'rounds').stream())
    for round_doc in rounds:
        round_data = {
            'id': round_doc.id,
            **convert_timestamps(round_doc.to_dict()),
            'participants': []
        }
        
        # Export participants
        participants = list(db.collection('tournaments', tournament_id, 'rounds', round_doc.id, 'participants').stream())
        for participant in participants:
            round_data['participants'].append({
                'id': participant.id,
                **convert_timestamps(participant.to_dict())
            })
        
        export_data['rounds'].append(round_data)
    
    # Save to file
    if output_file is None:
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        output_file = f"dev/exports/tournament_{tournament_id}_{timestamp}.json"
    
    import os
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    
    with open(output_file, 'w') as f:
        json.dump(export_data, f, indent=2)
    
    print(f"✅ Exported tournament to: {output_file}")
    print(f"   Players: {len(export_data['players'])}")
    print(f"   Tables: {len(export_data['tables'])}")
    print(f"   Rounds: {len(export_data['rounds'])}")

def export_all():
    """Export all tournaments"""
    db = init_firebase()
    
    tournaments = list(db.collection('tournaments').stream())
    
    if len(tournaments) == 0:
        print("No tournaments to export.")
        return
    
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    
    print(f"\n📦 Exporting {len(tournaments)} tournament(s)...\n")
    
    for tournament in tournaments:
        t_data = tournament.to_dict()
        print(f"Exporting: {t_data.get('name', 'Unnamed')}...")
        export_tournament(tournament.id)
    
    print(f"\n✅ All tournaments exported to dev/exports/\n")

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1:
        tournament_id = sys.argv[1]
        export_tournament(tournament_id)
    else:
        export_all()

