#!/usr/bin/env python3
"""
Database Cleanup Utilities
Scripts to clean up and maintain your Firebase database
"""

from setup_firebase import init_firebase
import sys

def delete_tournament(tournament_id):
    """Delete a specific tournament and all its data"""
    db = init_firebase()
    
    # Get tournament
    tournament_ref = db.collection('tournaments').document(tournament_id)
    tournament = tournament_ref.get()
    
    if not tournament.exists:
        print(f"❌ Tournament {tournament_id} not found")
        return
    
    t_data = tournament.to_dict()
    print(f"\n⚠️  About to delete: {t_data.get('name', 'Unnamed')}")
    
    confirm = input("Type 'DELETE' to confirm: ")
    if confirm != 'DELETE':
        print("Cancelled.")
        return
    
    print(f"\nDeleting tournament: {t_data.get('name')}...")
    
    # Delete all players
    players = list(db.collection('tournaments', tournament_id, 'players').stream())
    print(f"  Deleting {len(players)} players...")
    for player in players:
        player.reference.delete()
    
    # Delete all tables
    tables = list(db.collection('tournaments', tournament_id, 'tables').stream())
    print(f"  Deleting {len(tables)} tables...")
    for table in tables:
        table.reference.delete()
    
    # Delete all rounds and their participants
    rounds = list(db.collection('tournaments', tournament_id, 'rounds').stream())
    print(f"  Deleting {len(rounds)} rounds...")
    for round_doc in rounds:
        # Delete participants first
        participants = list(db.collection('tournaments', tournament_id, 'rounds', round_doc.id, 'participants').stream())
        for participant in participants:
            participant.reference.delete()
        round_doc.reference.delete()
    
    # Delete tournament
    tournament_ref.delete()
    print(f"✅ Deleted tournament: {t_data.get('name')}\n")

def delete_all_tournaments():
    """Delete ALL tournaments"""
    db = init_firebase()
    
    tournaments = list(db.collection('tournaments').stream())
    
    if len(tournaments) == 0:
        print("No tournaments to delete.")
        return
    
    print(f"\n⚠️  About to delete {len(tournaments)} tournament(s):")
    for t in tournaments:
        t_data = t.to_dict()
        print(f"   - {t_data.get('name', 'Unnamed')}")
    
    confirm = input("\nType 'DELETE ALL' to confirm: ")
    if confirm != 'DELETE ALL':
        print("Cancelled.")
        return
    
    print("\nDeleting all tournaments...")
    for tournament in tournaments:
        delete_tournament(tournament.id)
    
    print("✅ All tournaments deleted!\n")

def delete_all_data():
    """Nuclear option: delete EVERYTHING"""
    db = init_firebase()
    
    print("\n☢️  NUCLEAR OPTION: DELETE ALL DATA")
    print("="*50)
    print("This will delete:")
    print("  - All tournaments")
    print("  - All players")
    print("  - All tables")
    print("  - All rounds")
    print("  - All participants")
    print("  - Test data")
    print("="*50)
    
    confirm1 = input("\nType 'NUCLEAR' to confirm: ")
    if confirm1 != 'NUCLEAR':
        print("Cancelled.")
        return
    
    confirm2 = input("Are you ABSOLUTELY sure? Type 'YES': ")
    if confirm2 != 'YES':
        print("Cancelled.")
        return
    
    print("\n☢️  Starting nuclear cleanup...")
    
    # Delete all tournaments
    delete_all_tournaments()
    
    # Delete test collection
    test_docs = list(db.collection('test').stream())
    if test_docs:
        print(f"Deleting {len(test_docs)} test documents...")
        for doc in test_docs:
            doc.reference.delete()
    
    print("☢️  Database wiped clean!\n")

def find_orphaned_data():
    """Find orphaned references in the database"""
    db = init_firebase()
    
    print("\n🔍 Scanning for orphaned data...\n")
    
    tournaments = list(db.collection('tournaments').stream())
    orphan_count = 0
    
    for tournament in tournaments:
        t_data = tournament.to_dict()
        print(f"Checking: {t_data.get('name', 'Unnamed')}...")
        
        # Get all players and tables
        players = {p.id: p for p in db.collection('tournaments', tournament.id, 'players').stream()}
        tables = {t.id: t for t in db.collection('tournaments', tournament.id, 'tables').stream()}
        
        # Check players assigned to non-existent tables
        for player_id, player in players.items():
            p_data = player.to_dict()
            table_id = p_data.get('tableId')
            if table_id and table_id not in tables:
                print(f"  ⚠️  Player '{p_data.get('name')}' assigned to non-existent table: {table_id}")
                orphan_count += 1
        
        # Check tables with non-existent players
        for table_id, table in tables.items():
            t_data = table.to_dict()
            table_players = t_data.get('players', [])
            for player_id in table_players:
                if player_id not in players:
                    print(f"  ⚠️  Table {t_data.get('tableNumber')} references non-existent player: {player_id}")
                    orphan_count += 1
    
    if orphan_count == 0:
        print("✅ No orphaned data found!\n")
    else:
        print(f"\n⚠️  Found {orphan_count} orphaned reference(s)\n")

def main():
    """Main menu"""
    if len(sys.argv) > 1:
        command = sys.argv[1]
        
        if command == 'delete-all':
            delete_all_tournaments()
        elif command == 'nuclear':
            delete_all_data()
        elif command == 'find-orphans':
            find_orphaned_data()
        elif command == 'delete' and len(sys.argv) > 2:
            delete_tournament(sys.argv[2])
        else:
            print("Unknown command")
            print_usage()
    else:
        print_usage()

def print_usage():
    print("\n📋 Database Cleanup Utilities")
    print("="*50)
    print("Usage:")
    print("  python dev/db_cleanup.py delete-all           # Delete all tournaments")
    print("  python dev/db_cleanup.py delete <id>          # Delete specific tournament")
    print("  python dev/db_cleanup.py find-orphans         # Find orphaned data")
    print("  python dev/db_cleanup.py nuclear              # Delete EVERYTHING")
    print("="*50 + "\n")

if __name__ == "__main__":
    main()

