#!/usr/bin/env python3
"""
Add a win to a specific player
"""

from setup_firebase import init_firebase
from firebase_admin import firestore
import sys

def add_win(tournament_id, player_name, amount=1):
    """Add or remove wins from a player by name"""
    db = init_firebase()
    
    # Find player by name
    players_ref = db.collection('tournaments', tournament_id, 'players')
    players = list(players_ref.stream())
    
    player_doc = None
    for p in players:
        if p.to_dict().get('name', '').lower() == player_name.lower():
            player_doc = p
            break
    
    if not player_doc:
        print(f"❌ Player '{player_name}' not found in tournament")
        return
    
    player_data = player_doc.to_dict()
    current_wins = player_data.get('wins', 0)
    new_wins = max(0, current_wins + amount)  # Don't go below 0
    
    print(f"\n✅ Found: {player_data['name']}")
    print(f"   Current wins: {current_wins}")
    
    # Update wins (only update lastWinAt on actual wins, not losses)
    if amount > 0:
        player_doc.reference.update({
            'wins': firestore.Increment(amount),
            'lastWinAt': firestore.SERVER_TIMESTAMP
        })
        print(f"   New wins: {new_wins}")
        print(f"\n🎉 Win recorded!\n")
    else:
        player_doc.reference.update({
            'wins': firestore.Increment(amount)
        })
        print(f"   New wins: {new_wins}")
        print(f"\n❌ Loss recorded (lastWinAt unchanged)\n")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("\n🎯 Add/Remove Wins")
        print("="*60)
        print("Usage:")
        print("  python db_add_win.py <tournament-id> <player-name> [amount]")
        print("")
        print("Arguments:")
        print("  amount     Number to add/subtract (default: +1)")
        print("             Use negative numbers to remove wins")
        print("")
        print("Examples:")
        print("  python db_add_win.py abc123 'Frank Foster'      # +1 win")
        print("  python db_add_win.py abc123 'Frank Foster' -1   # -1 win (mistake)")
        print("  python db_add_win.py abc123 'Frank Foster' 3    # +3 wins")
        print("="*60 + "\n")
    else:
        tournament_id = sys.argv[1]
        # Find where the amount is (if provided)
        amount = 1
        player_parts = []
        
        for i in range(2, len(sys.argv)):
            try:
                amount = int(sys.argv[i])
                player_parts = sys.argv[2:i]
                break
            except ValueError:
                continue
        
        if not player_parts:
            player_parts = sys.argv[2:]
        
        player_name = ' '.join(player_parts)
        add_win(tournament_id, player_name, amount)

