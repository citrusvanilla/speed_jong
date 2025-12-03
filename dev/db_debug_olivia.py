#!/usr/bin/env python3
"""
Debug script to check Olivia Nelson's ranking
"""

import firebase_admin
from firebase_admin import credentials, firestore
from datetime import datetime

# Initialize Firebase
if not firebase_admin._apps:
    cred = credentials.Certificate('serviceAccountKey.json')
    firebase_admin.initialize_app(cred)

db = firestore.client()

def debug_olivia_ranking(tournament_id):
    """Debug Olivia Nelson's ranking"""
    
    # Get tournament data
    tournament_ref = db.collection('tournaments').document(tournament_id)
    tournament = tournament_ref.get()
    
    if not tournament.exists:
        print(f"Tournament {tournament_id} not found")
        return
    
    tournament_data = tournament.to_dict()
    current_round = tournament_data.get('currentRound', 0)
    
    print(f"\n{'='*80}")
    print(f"Tournament: {tournament_data.get('name')}")
    print(f"Current Round: {current_round}")
    print(f"Type: {tournament_data.get('type')}")
    print(f"{'='*80}\n")
    
    # Get all players
    players_ref = tournament_ref.collection('players')
    players = {doc.id: {**doc.to_dict(), 'id': doc.id} for doc in players_ref.stream()}
    
    # Find Olivia Nelson
    olivia = None
    for player_id, player_data in players.items():
        if 'olivia' in player_data.get('name', '').lower() and 'nelson' in player_data.get('name', '').lower():
            olivia = player_data
            olivia['id'] = player_id
            break
    
    if not olivia:
        print("Olivia Nelson not found!")
        return
    
    print(f"Found: {olivia['name']} (ID: {olivia['id']})")
    print(f"  - Eliminated: {olivia.get('eliminated', False)}")
    print(f"  - Current Table ID: {olivia.get('tableId', 'None')}")
    print(f"  - Last Win At: {olivia.get('lastWinAt', 'None')}")
    
    # Get score events
    score_events = olivia.get('scoreEvents', [])
    print(f"  - Total Score Events: {len(score_events)}")
    
    # Build rounds map
    rounds_ref = tournament_ref.collection('rounds')
    rounds_map = {}
    last_completed_round = 0
    
    for round_doc in rounds_ref.stream():
        round_data = round_doc.to_dict()
        round_num = round_data.get('roundNumber')
        rounds_map[round_num] = {
            'id': round_doc.id,
            'scoreMultiplier': round_data.get('scoreMultiplier', 1),
            'status': round_data.get('status', 'staging')
        }
        if round_data.get('status') == 'completed' and round_num > last_completed_round:
            last_completed_round = round_num
    
    print(f"\n  Last Completed Round: {last_completed_round}")
    
    # Calculate tournament score
    tournament_score = 0
    for event in score_events:
        multiplier = rounds_map.get(event.get('roundNumber'), {}).get('scoreMultiplier', 1)
        tournament_score += event.get('delta', 0) * multiplier
    
    # Calculate round score for last completed round
    round_score = 0
    for event in score_events:
        if event.get('roundNumber') == last_completed_round:
            multiplier = rounds_map.get(last_completed_round, {}).get('scoreMultiplier', 1)
            round_score += event.get('delta', 0) * multiplier
    
    print(f"  - Tournament Score: {tournament_score}")
    print(f"  - Round {last_completed_round} Score: {round_score}")
    
    # Get table assignment from last completed round participants
    if last_completed_round > 0:
        round_id = rounds_map[last_completed_round]['id']
        participants_ref = tournament_ref.collection('rounds').document(round_id).collection('participants')
        
        olivia_table_id = None
        for part_doc in participants_ref.stream():
            part_data = part_doc.to_dict()
            if part_data.get('playerId') == olivia['id']:
                olivia_table_id = part_data.get('tableId')
                break
        
        print(f"  - Round {last_completed_round} Table ID: {olivia_table_id}")
        
        # Get all players at that table
        if olivia_table_id:
            table_players = []
            for part_doc in participants_ref.stream():
                part_data = part_doc.to_dict()
                if part_data.get('tableId') == olivia_table_id:
                    player_id = part_data.get('playerId')
                    player = players.get(player_id)
                    if player:
                        # Calculate round score for this player
                        player_round_score = 0
                        for event in player.get('scoreEvents', []):
                            if event.get('roundNumber') == last_completed_round:
                                multiplier = rounds_map.get(last_completed_round, {}).get('scoreMultiplier', 1)
                                player_round_score += event.get('delta', 0) * multiplier
                        
                        table_players.append({
                            'name': player.get('name'),
                            'roundScore': player_round_score
                        })
            
            table_round_score = sum(p['roundScore'] for p in table_players)
            
            print(f"\n  Table Players ({len(table_players)}):")
            for tp in table_players:
                print(f"    - {tp['name']}: Round Score = {tp['roundScore']}")
            print(f"  Table Round Score Total: {table_round_score}")
    
    # Now rank all active players
    print(f"\n{'='*80}")
    print(f"ALL ACTIVE PLAYERS RANKING:")
    print(f"{'='*80}\n")
    
    active_players = [p for p in players.values() if not p.get('eliminated', False)]
    
    # Calculate scores for all players
    for player in active_players:
        # Tournament score
        player['_tournamentScore'] = sum(
            event.get('delta', 0) * rounds_map.get(event.get('roundNumber'), {}).get('scoreMultiplier', 1)
            for event in player.get('scoreEvents', [])
        )
        
        # Round score
        player['_roundScore'] = sum(
            event.get('delta', 0) * rounds_map.get(last_completed_round, {}).get('scoreMultiplier', 1)
            for event in player.get('scoreEvents', [])
            if event.get('roundNumber') == last_completed_round
        )
        
        # Last win timestamp
        last_win = player.get('lastWinAt')
        player['_lastWin'] = last_win.timestamp() if last_win else 0
        
        # Table round score - need to get from participants
        player['_tableRoundScore'] = 0
        
        if last_completed_round > 0:
            round_id = rounds_map[last_completed_round]['id']
            participants_ref = tournament_ref.collection('rounds').document(round_id).collection('participants')
            
            # Find this player's table
            player_table_id = None
            for part_doc in participants_ref.stream():
                part_data = part_doc.to_dict()
                if part_data.get('playerId') == player['id']:
                    player_table_id = part_data.get('tableId')
                    break
            
            if player_table_id:
                # Sum all players' round scores at this table
                for part_doc in participants_ref.stream():
                    part_data = part_doc.to_dict()
                    if part_data.get('tableId') == player_table_id:
                        other_player_id = part_data.get('playerId')
                        other_player = players.get(other_player_id)
                        if other_player:
                            other_round_score = sum(
                                event.get('delta', 0) * rounds_map.get(last_completed_round, {}).get('scoreMultiplier', 1)
                                for event in other_player.get('scoreEvents', [])
                                if event.get('roundNumber') == last_completed_round
                            )
                            player['_tableRoundScore'] += other_round_score
    
    # Sort by ranking algorithm
    sorted_players = sorted(active_players, key=lambda p: (
        -p['_tournamentScore'],
        -p['_roundScore'],
        -p['_lastWin'],
        -p['_tableRoundScore'],
        p.get('name', '')
    ))
    
    # Display top 10 and around Olivia
    print(f"{'Rank':<6} {'Name':<25} {'T.Score':<10} {'R.Score':<10} {'Last Win':<12} {'Table Score':<12}")
    print(f"{'-'*6} {'-'*25} {'-'*10} {'-'*10} {'-'*12} {'-'*12}")
    
    for i, player in enumerate(sorted_players[:15], 1):
        is_olivia = player['id'] == olivia['id']
        marker = ">>> " if is_olivia else "    "
        last_win_str = "None" if player['_lastWin'] == 0 else "Yes"
        
        print(f"{marker}{i:<3} {player.get('name', '')[:25]:<25} {player['_tournamentScore']:<10} {player['_roundScore']:<10} {last_win_str:<12} {player['_tableRoundScore']:<12}")

if __name__ == '__main__':
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python db_debug_olivia.py <tournament_id>")
        sys.exit(1)
    
    tournament_id = sys.argv[1]
    debug_olivia_ranking(tournament_id)

