#!/usr/bin/env python3
"""
Database Statistics
View statistics about your Firebase database
"""

from setup_firebase import init_firebase

def get_stats():
    """Get database statistics"""
    db = init_firebase()
    
    print("\n📊 DATABASE STATISTICS\n" + "="*50)
    
    # Get all tournaments
    tournaments_ref = db.collection('tournaments')
    tournaments = list(tournaments_ref.stream())
    
    print(f"\n🏆 Tournaments: {len(tournaments)}")
    
    if len(tournaments) == 0:
        print("   No tournaments found.")
        return
    
    total_players = 0
    total_tables = 0
    total_rounds = 0
    total_participants = 0
    
    for tournament in tournaments:
        t_data = tournament.to_dict()
        print(f"\n   📋 {t_data.get('name', 'Unnamed')}")
        print(f"      ID: {tournament.id}")
        print(f"      Room Code: {t_data.get('roomCode', 'N/A')}")
        print(f"      Status: {t_data.get('status', 'unknown')}")
        print(f"      Type: {t_data.get('type', 'standard')}")
        print(f"      Current Round: {t_data.get('currentRound', 0)}")
        
        # Count players
        players = list(db.collection('tournaments', tournament.id, 'players').stream())
        total_players += len(players)
        print(f"      Players: {len(players)}")
        
        # Count tables
        tables = list(db.collection('tournaments', tournament.id, 'tables').stream())
        total_tables += len(tables)
        print(f"      Tables: {len(tables)}")
        
        # Count rounds
        rounds_ref = db.collection('tournaments', tournament.id, 'rounds')
        rounds = list(rounds_ref.stream())
        total_rounds += len(rounds)
        print(f"      Rounds: {len(rounds)}")
        
        # Count participants across all rounds
        for round_doc in rounds:
            participants = list(db.collection('tournaments', tournament.id, 'rounds', round_doc.id, 'participants').stream())
            total_participants += len(participants)
    
    print(f"\n" + "="*50)
    print(f"TOTALS:")
    print(f"  Total Players: {total_players}")
    print(f"  Total Tables: {total_tables}")
    print(f"  Total Rounds: {total_rounds}")
    print(f"  Total Participants (all rounds): {total_participants}")
    print("="*50 + "\n")

if __name__ == "__main__":
    get_stats()

