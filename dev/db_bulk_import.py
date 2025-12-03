#!/usr/bin/env python3
"""
Bulk Player Import
Import multiple players from a text/CSV file
"""

from setup_firebase import init_firebase
import sys
from firebase_admin import firestore

def bulk_import_players(tournament_id, file_path):
    """Import players from a file (one name per line)"""
    db = init_firebase()
    
    # Read file
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            names = [line.strip() for line in f if line.strip()]
    except FileNotFoundError:
        print(f"❌ File not found: {file_path}")
        return
    except Exception as e:
        print(f"❌ Error reading file: {e}")
        return
    
    if not names:
        print("❌ No player names found in file")
        return
    
    print(f"\n📋 Found {len(names)} name(s) in file")
    
    # Check for duplicates in the file
    unique_names = list(dict.fromkeys([name.lower() for name in names]))
    if len(unique_names) < len(names):
        duplicate_count = len(names) - len(unique_names)
        print(f"⚠️  Warning: Found {duplicate_count} duplicate(s) in file (will be skipped)")
    
    # Get existing players
    tournament_ref = db.collection('tournaments').document(tournament_id)
    tournament = tournament_ref.get()
    
    if not tournament.exists:
        print(f"❌ Tournament not found: {tournament_id}")
        return
    
    tournament_data = tournament.to_dict()
    print(f"\n🏆 Tournament: {tournament_data.get('name', 'Unnamed')}")
    
    # Check player limit
    max_players = tournament_data.get('maxPlayers', 0)
    players_ref = db.collection('tournaments', tournament_id, 'players')
    existing_players = list(players_ref.stream())
    current_count = len(existing_players)
    
    existing_names = {p.to_dict().get('name', '').lower(): p.to_dict().get('name', '') 
                      for p in existing_players}
    
    # Filter out duplicates
    new_names = []
    skipped = []
    
    for name in names:
        name_lower = name.lower()
        if name_lower in existing_names:
            skipped.append(f"{name} (already exists as '{existing_names[name_lower]}')")
        elif name_lower not in [n.lower() for n in new_names]:
            new_names.append(name)
    
    if skipped:
        print(f"\n⚠️  {len(skipped)} player(s) will be skipped:")
        for s in skipped:
            print(f"   • {s}")
    
    if not new_names:
        print("\n❌ No new players to import after filtering duplicates")
        return
    
    # Check max players limit
    if max_players > 0:
        available = max_players - current_count
        if len(new_names) > available:
            print(f"\n⚠️  Tournament limit: {max_players} players")
            print(f"   Current: {current_count} players")
            print(f"   Available slots: {available}")
            print(f"   Trying to import: {len(new_names)} players")
            
            if available <= 0:
                print("❌ Tournament is at maximum capacity")
                return
            
            response = input(f"\nOnly {available} player(s) can be added. Import first {available}? (y/N): ")
            if response.lower() != 'y':
                print("Cancelled.")
                return
            
            new_names = new_names[:available]
    
    # Preview and confirm
    print(f"\n📥 Will import {len(new_names)} player(s):")
    for i, name in enumerate(new_names, 1):
        print(f"   {i}. {name}")
    
    response = input(f"\nProceed with import? (y/N): ")
    if response.lower() != 'y':
        print("Cancelled.")
        return
    
    # Import players
    print("\n⏳ Importing players...")
    imported = 0
    failed = 0
    
    for name in new_names:
        try:
            player_ref = players_ref.document()
            player_ref.set({
                'name': name,
                'registeredAt': firestore.SERVER_TIMESTAMP,
                'tableId': None,
                'position': None,
                'wins': 0,
                'points': 0,
                'lastWinAt': None,
                'eliminated': False,
                'eliminatedInRound': None
            })
            print(f"   ✅ {name}")
            imported += 1
        except Exception as e:
            print(f"   ❌ {name}: {e}")
            failed += 1
    
    print(f"\n{'='*50}")
    print(f"✅ Successfully imported: {imported} player(s)")
    if failed > 0:
        print(f"❌ Failed: {failed} player(s)")
    print(f"{'='*50}\n")

def list_tournaments_for_import():
    """List available tournaments for import"""
    db = init_firebase()
    
    tournaments = list(db.collection('tournaments').stream())
    
    if not tournaments:
        print("No tournaments found.")
        return
    
    print("\n📋 Available Tournaments:")
    print("="*50)
    
    for t in tournaments:
        t_data = t.to_dict()
        players_count = len(list(db.collection('tournaments', t.id, 'players').stream()))
        max_players = t_data.get('maxPlayers', 0)
        max_str = f"/ {max_players}" if max_players > 0 else ""
        
        print(f"\n🏆 {t_data.get('name', 'Unnamed')}")
        print(f"   ID: {t.id}")
        print(f"   Status: {t_data.get('status', 'unknown')}")
        print(f"   Players: {players_count} {max_str}")
        print(f"   Type: {t_data.get('type', 'standard')}")
    
    print("\n" + "="*50 + "\n")

def main():
    """Main function"""
    if len(sys.argv) < 2:
        print_usage()
        return
    
    command = sys.argv[1]
    
    if command == 'list':
        list_tournaments_for_import()
    elif command == 'import' and len(sys.argv) >= 4:
        tournament_id = sys.argv[2]
        file_path = sys.argv[3]
        bulk_import_players(tournament_id, file_path)
    else:
        print_usage()

def print_usage():
    print("\n📋 Bulk Player Import Utility")
    print("="*50)
    print("Usage:")
    print("  python db_bulk_import.py list")
    print("     List all tournaments with IDs")
    print("")
    print("  python db_bulk_import.py import <tournament-id> <file-path>")
    print("     Import players from a file")
    print("")
    print("File Format:")
    print("  • Plain text or CSV")
    print("  • One player name per line")
    print("  • Empty lines will be ignored")
    print("")
    print("Example:")
    print("  python db_bulk_import.py list")
    print("  python db_bulk_import.py import abc123 players.txt")
    print("="*50 + "\n")

if __name__ == "__main__":
    main()





