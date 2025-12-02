#!/usr/bin/env python3
"""
Start a tournament round
Creates round record and snapshots all active players as participants
"""

from setup_firebase import init_firebase
from firebase_admin import firestore
import sys

def start_round(tournament_id):
    """Start the next round for a tournament"""
    db = init_firebase()
    
    # Get tournament
    tournament_ref = db.collection('tournaments').document(tournament_id)
    tournament = tournament_ref.get()
    
    if not tournament.exists:
        print(f"❌ Tournament {tournament_id} not found")
        return
    
    t_data = tournament.to_dict()
    current_round = t_data.get('currentRound', 0)
    round_in_progress = t_data.get('roundInProgress', False)
    
    if round_in_progress:
        print(f"❌ Round {current_round} is already in progress")
        print(f"   End the current round before starting a new one")
        return
    
    next_round = current_round + 1
    
    print(f"\n🏆 Tournament: {t_data.get('name', 'Unnamed')}")
    print(f"   Current Round: {current_round}")
    print(f"   Next Round: {next_round}")
    
    # Get active players
    players_ref = db.collection('tournaments', tournament_id, 'players')
    all_players = list(players_ref.stream())
    
    active_players = []
    for p in all_players:
        p_data = p.to_dict()
        if not p_data.get('eliminated', False):
            active_players.append({'id': p.id, **p_data})
    
    if len(active_players) == 0:
        print("❌ No active players found")
        return
    
    if len(active_players) % 4 != 0:
        remainder = len(active_players) % 4
        print(f"\n❌ Cannot start round!")
        print(f"   Active players: {len(active_players)}")
        print(f"   Remainder: {remainder}")
        print(f"   Number of players must be divisible by 4")
        return
    
    num_tables = len(active_players) // 4
    
    confirm = input(f"\nStart Round {next_round} with {len(active_players)} active players ({num_tables} tables)? (y/N): ")
    if confirm.lower() != 'y':
        print("Cancelled.")
        return
    
    print(f"\n⏳ Starting Round {next_round}...")
    
    try:
        # Create round record
        round_ref = db.collection('tournaments', tournament_id, 'rounds').document()
        round_id = round_ref.id
        
        round_ref.set({
            'roundNumber': next_round,
            'startedAt': firestore.SERVER_TIMESTAMP,
            'endedAt': None,
            'status': 'in_progress'
        })
        
        print(f"   ✅ Round {next_round} record created")
        
        # Snapshot all active players as participants
        print(f"   ⏳ Snapshotting {len(active_players)} participants...")
        
        for player in active_players:
            participant_ref = db.collection('tournaments', tournament_id, 'rounds', round_id, 'participants').document()
            participant_ref.set({
                'playerId': player['id'],
                'name': player['name'],
                'wins': player.get('wins', 0),
                'points': player.get('points', 0),
                'tableId': player.get('tableId'),
                'position': player.get('position'),
                'lastWinAt': player.get('lastWinAt'),
                'snapshotAt': firestore.SERVER_TIMESTAMP
            })
        
        print(f"   ✅ {len(active_players)} participants snapshotted")
        
        # Update tournament
        tournament_ref.update({
            'currentRound': next_round,
            'roundInProgress': True
        })
        
        print(f"\n{'='*50}")
        print(f"✅ Round {next_round} started!")
        print(f"   Participants: {len(active_players)}")
        print(f"   Tables: {num_tables}")
        print(f"{'='*50}\n")
        
    except Exception as e:
        print(f"\n❌ Error starting round: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("\n🎬 Start Tournament Round")
        print("="*50)
        print("Usage:")
        print("  python db_start_round.py <tournament-id>")
        print("")
        print("This will:")
        print("  • Create a new round record")
        print("  • Snapshot all active players as participants")
        print("  • Mark tournament as round in progress")
        print("")
        print("Requirements:")
        print("  • No round currently in progress")
        print("  • Active players divisible by 4")
        print("="*50 + "\n")
    else:
        start_round(sys.argv[1])




