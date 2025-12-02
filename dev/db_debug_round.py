#!/usr/bin/env python3
"""
Debug round data - show player vs participant wins
"""

from setup_firebase import init_firebase
import sys

def debug_round(tournament_id):
    db = init_firebase()
    
    # Get tournament
    t_doc = db.collection('tournaments').document(tournament_id).get()
    t_data = t_doc.to_dict()
    
    print(f"\n🏆 {t_data.get('name')}")
    print(f"   Current Round: {t_data.get('currentRound')}")
    print(f"   Round In Progress: {t_data.get('roundInProgress')}")
    
    # Get current round
    current_round = t_data.get('currentRound', 0)
    
    if current_round == 0:
        print("\n❌ No rounds started yet")
        return
    
    # Find the round document
    rounds = list(db.collection('tournaments', tournament_id, 'rounds').stream())
    round_doc = None
    for r in rounds:
        r_data = r.to_dict()
        if r_data.get('roundNumber') == current_round:
            round_doc = r
            break
    
    if not round_doc:
        print(f"\n❌ Round {current_round} document not found")
        return
    
    print(f"\n📊 Round {current_round} Analysis:")
    print("="*80)
    
    # Get all players
    players = {}
    for p in db.collection('tournaments', tournament_id, 'players').stream():
        p_data = p.to_dict()
        players[p.id] = {
            'name': p_data.get('name'),
            'current_wins': p_data.get('wins', 0)
        }
    
    # Get all participants
    participants = list(db.collection('tournaments', tournament_id, 'rounds', round_doc.id, 'participants').stream())
    
    print(f"{'Player':<25} {'Start Wins':<12} {'Current Wins':<14} {'Round Wins':<12}")
    print("-"*80)
    
    total_start = 0
    total_current = 0
    
    for part_doc in participants:
        part_data = part_doc.to_dict()
        player_id = part_data.get('playerId')
        snapshot_wins = part_data.get('wins', 0)
        
        if player_id in players:
            current_wins = players[player_id]['current_wins']
            round_wins = current_wins - snapshot_wins
            name = players[player_id]['name']
            
            print(f"{name:<25} {snapshot_wins:<12} {current_wins:<14} {round_wins:<12}")
            
            total_start += snapshot_wins
            total_current += current_wins
    
    print("-"*80)
    print(f"{'TOTALS':<25} {total_start:<12} {total_current:<14} {total_current - total_start:<12}")
    print("="*80)
    print()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python db_debug_round.py <tournament-id>")
    else:
        debug_round(sys.argv[1])




