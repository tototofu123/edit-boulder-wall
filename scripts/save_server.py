import http.server
import json
import csv
import os
import urllib.parse
import sys


FOOT_LABELS = ['Heaven', 'Good', 'Mid', 'Bad', 'Hell']


def clamp(value, minimum, maximum):
    return max(minimum, min(maximum, value))


def safe_number(value, fallback):
    try:
        parsed = float(value)
        if parsed != parsed:
            return fallback
        return parsed
    except Exception:
        return fallback


def foot_label_from_rating(rating):
    return FOOT_LABELS[clamp(int(round(safe_number(rating, 3))), 1, 5) - 1]


def direction_label(direction):
    normalized = int(round(safe_number(direction, 180))) % 360
    labels = {
        0: 'up',
        45: 'up-right',
        90: 'right',
        135: 'down-right',
        180: 'down',
        225: 'down-left',
        270: 'left',
        315: 'up-left',
    }
    return labels.get(normalized, f'{normalized}°')


def truthy(value):
    return str(value).strip().lower() in ('1', 'true', 'yes', 'y', 'on')


def infer_foot_rating(meta):
    hold_type = str(meta.get('type', '')).lower()
    base_difficulty = int(clamp(safe_number(meta.get('difficulty', 1), 1), 1, 5))
    hand_difficulty = int(clamp(safe_number(meta.get('handDifficulty', base_difficulty * 2), base_difficulty * 2), 1, 10))
    box_size = safe_number(meta.get('boxSize', 0), 0)
    size_bonus = -1 if box_size >= 90 else 0 if box_size >= 70 else 1

    if hold_type == 'jug':
        return int(clamp(1 + size_bonus, 1, 5))
    if hold_type == 'sloper':
        return int(clamp(3 + size_bonus, 1, 5))
    if hold_type in ('crimp', 'jib', 'pocket'):
        return int(clamp(4 + size_bonus + max(0, base_difficulty - 2), 1, 5))
    if hold_type == 'pinch':
        return int(clamp(3 + size_bonus + max(0, base_difficulty - 3), 1, 5))
    return int(clamp(round(hand_difficulty / 2) + size_bonus, 1, 5))


def infer_foot_difficulty(meta):
    return int(clamp(infer_foot_rating(meta) * 2, 1, 10))


def infer_general_usability(meta):
    hold_type = str(meta.get('type', '')).lower()
    base_difficulty = int(clamp(safe_number(meta.get('difficulty', 1), 1), 1, 5))
    hand_difficulty = int(clamp(safe_number(meta.get('handDifficulty', base_difficulty * 2), base_difficulty * 2), 1, 10))
    foot_difficulty = int(clamp(safe_number(meta.get('footDifficulty', infer_foot_difficulty(meta)), infer_foot_difficulty(meta)), 1, 10))
    box_size = safe_number(meta.get('boxSize', 0), 0)

    if hold_type == 'jug':
        return int(clamp(1 + (0 if box_size >= 70 else 1), 1, 10))
    if hold_type == 'sloper':
        return int(clamp(4 + base_difficulty, 1, 10))
    if hold_type in ('crimp', 'jib', 'pocket'):
        return int(clamp(6 + max(base_difficulty, hand_difficulty // 2), 1, 10))
    if hold_type == 'pinch':
        return int(clamp(5 + max(1, base_difficulty), 1, 10))
    return int(clamp(round((hand_difficulty + foot_difficulty) / 2), 1, 10))


def infer_ideal_usage(meta):
    hold_type = str(meta.get('type', '')).lower()
    foot_difficulty = int(clamp(safe_number(meta.get('footDifficulty', infer_foot_difficulty(meta)), infer_foot_difficulty(meta)), 1, 10))
    hand_difficulty = int(clamp(safe_number(meta.get('handDifficulty', 2), 2), 1, 10))
    if hold_type == 'jug' or hand_difficulty <= 3:
        return 'General'
    if foot_difficulty <= 3:
        return 'Feet'
    if hand_difficulty <= foot_difficulty:
        return 'Hand'
    return 'Not Ideal'


def build_hold_spec_rows(metadata):
    hold_annotations_path = 'docs/hold_annotations.json'
    if not os.path.exists(hold_annotations_path):
        return []

    with open(hold_annotations_path, 'r') as f:
        holds = json.load(f)

    rows = []
    for hold in holds:
        cell = hold.get('cell', '')
        cat = hold.get('cat', '')
        num = hold.get('num', 0)
        full_cat = {'C': 'climbing holds', 'I': 'insert holds', 'F': 'wall features'}.get(cat, '')
        meta = (metadata.get(cell, {}) or {}).get(f'{full_cat}{num}', {}) if full_cat else {}

        base_difficulty = int(clamp(safe_number(meta.get('difficulty', 1), 1), 1, 5))
        hand_difficulty = int(clamp(safe_number(meta.get('handDifficulty', base_difficulty * 2), base_difficulty * 2), 1, 10))
        foot_rating = int(clamp(safe_number(meta.get('footRating', infer_foot_rating({**meta, 'difficulty': base_difficulty, 'handDifficulty': hand_difficulty, 'boxSize': hold.get('boxSize', 0)})), 3), 1, 5))
        foot_difficulty = int(clamp(safe_number(meta.get('footDifficulty', infer_foot_difficulty({**meta, 'difficulty': base_difficulty, 'handDifficulty': hand_difficulty, 'boxSize': hold.get('boxSize', 0)})), infer_foot_difficulty({**meta, 'difficulty': base_difficulty, 'handDifficulty': hand_difficulty, 'boxSize': hold.get('boxSize', 0)})), 1, 10))
        general_usability = int(clamp(safe_number(meta.get('generalUsability', infer_general_usability({**meta, 'difficulty': base_difficulty, 'handDifficulty': hand_difficulty, 'footDifficulty': foot_difficulty, 'boxSize': hold.get('boxSize', 0)})), infer_general_usability({**meta, 'difficulty': base_difficulty, 'handDifficulty': hand_difficulty, 'footDifficulty': foot_difficulty, 'boxSize': hold.get('boxSize', 0)})), 1, 10))
        direction = int(clamp(safe_number(meta.get('direction', 180), 180), 0, 359))
        center = hold.get('center') or {}
        ideal_usage = meta.get('idealUsage', meta.get('ideal', infer_ideal_usage({**meta, 'difficulty': base_difficulty, 'handDifficulty': hand_difficulty, 'footDifficulty': foot_difficulty, 'boxSize': hold.get('boxSize', 0)})))

        rows.append({
            'id': hold.get('id'),
            'cell': cell,
            'cat': cat,
            'num': num,
            'category': full_cat,
            'type': meta.get('type', 'uncategorized'),
            'baseDifficulty': base_difficulty,
            'handDifficulty': hand_difficulty,
            'footDifficulty': foot_difficulty,
            'footRating': foot_rating,
            'footLabel': foot_label_from_rating(foot_rating),
            'generalUsability': general_usability,
            'direction': direction,
            'directionLabel': direction_label(direction),
            'center_x': center.get('x'),
            'center_y': center.get('y'),
            'boxSize': hold.get('boxSize', 0),
            'idealUsage': ideal_usage,
            'ideal': ideal_usage,
        })

    rows.sort(key=lambda row: (
        int(safe_number(str(row.get('cell', '0,0')).split(',')[1] if ',' in str(row.get('cell', '0,0')) else 0, 0)),
        int(safe_number(str(row.get('cell', '0,0')).split(',')[0] if ',' in str(row.get('cell', '0,0')) else 0, 0)),
        row.get('cat', ''),
        int(safe_number(row.get('num', 0), 0)),
    ))
    return rows


def write_hold_spec_files(metadata):
    rows = build_hold_spec_rows(metadata)
    with open('docs/HOLD_SPEC.json', 'w') as f:
        json.dump(rows, f, indent=4)

    fieldnames = ['id', 'cell', 'cat', 'num', 'category', 'type', 'baseDifficulty', 'handDifficulty', 'footDifficulty', 'footRating', 'footLabel', 'generalUsability', 'direction', 'directionLabel', 'center_x', 'center_y', 'boxSize', 'idealUsage', 'ideal']
    with open('docs/HOLD_SPEC.csv', 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

# Get configuration from command line arguments
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
DEFAULT_PAGE = sys.argv[2] if len(sys.argv) > 2 else '/climbing_categorizer.html'

class SaveHandler(http.server.BaseHTTPRequestHandler):
    def do_HEAD(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        # Serve static files
        if self.path == '/':
            self.path = DEFAULT_PAGE

        try:
            # Strip query parameters if present
            path_no_query = self.path.split('?')[0]
            # Decode URL characters (e.g. %20 -> space)
            decoded_path = urllib.parse.unquote(path_no_query.lstrip('/'))
            file_path = os.path.join(os.getcwd(), decoded_path)

            if os.path.exists(file_path) and os.path.isfile(file_path):        
                self.send_response(200)
                if file_path.endswith('.html'):
                    self.send_header('Content-type', 'text/html')
                elif file_path.endswith('.js'):
                    self.send_header('Content-type', 'application/javascript')
                elif file_path.endswith('.png'):
                    self.send_header('Content-type', 'image/png')
                elif file_path.endswith('.jpg') or file_path.endswith('.jpeg'):
                    self.send_header('Content-type', 'image/jpeg')
                self.end_headers()
                with open(file_path, 'rb') as f:
                    self.wfile.write(f.read())
            else:
                self.send_error(404, f'File Not Found: {decoded_path}')        
        except Exception as e:
            self.send_error(500, f'Internal Server Error: {str(e)}')

    def do_POST(self):
        if self.path == '/save':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data)

            # Save JSON
            with open('docs/holds_data.json', 'w') as f:
                json.dump(data['json'], f, indent=4)
            write_hold_spec_files(data['json'])

            # Save CSV
            if data['csv']:
                # Define sorting order
                cat_order = {'climbing holds': 0, 'insert holds': 1, 'wall features': 2}

                # Sort the main data list
                def sort_key(row):
                    try:
                        return (
                            int(row.get('cell_y', 0)),
                            int(row.get('cell_x', 0)),
                            cat_order.get(row.get('category', ''), 99),        
                            int(row.get('num', 0))
                        )
                    except:
                        return (0, 0, 99, 0)

                sorted_data = sorted(data['csv'], key=sort_key)
                fieldnames = ['cell_x', 'cell_y', 'category', 'num', 'type', 'difficulty', 'direction', 'ideal']

                with open('docs/holds_data.csv', 'w', newline='') as f:        
                    writer = csv.DictWriter(f, fieldnames=fieldnames)

                    # 1. WRITE 16 INDIVIDUAL TABLES
                    for y in range(4):
                        for x in range(4):
                            cell_rows = [r for r in sorted_data if int(r['cell_x']) == x and int(r['cell_y']) == y]
                            if cell_rows:
                                f.write(f"--- TABLE FOR CELL ({x},{y}) ---\n") 
                                writer.writeheader()
                                writer.writerows(cell_rows)
                                f.write("\n") # Spacer between tables

                    # 2. WRITE TOTAL TABLE
                    f.write("--- TOTAL COMBINED TABLE ---\n")
                    writer.writeheader()
                    writer.writerows(sorted_data)

            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'status': 'success'}).encode())       

        elif self.path == '/save_annotations':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data)

            with open('docs/wall_annotations.json', 'w') as f:
                json.dump(data, f, indent=4)

            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'status': 'success'}).encode())       

        elif self.path == '/save_grid':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data)

            # Save JSON
            with open('docs/grid_config.json', 'w') as f:
                json.dump(data, f, indent=4)

            # Save CSV
            with open('docs/grid_config.csv', 'w', newline='') as f:
                writer = csv.DictWriter(f, fieldnames=['label', 'x', 'y', 'w', 'h'])
                writer.writeheader()
                writer.writerows(data)

            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'status': 'success'}).encode())       

        elif self.path == '/save_full_edit':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data)

            # 1. Update hold_annotations.json (and CSV)
            if 'holds' in data:
                with open('docs/hold_annotations.json', 'w') as f:
                    json.dump(data['holds'], f, indent=4)
                
                # Update CSV version
                fieldnames = ['id', 'cell', 'cat', 'num', 'center', 'path']
                with open('docs/hold_annotations.csv', 'w', newline='') as f:
                    writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
                    writer.writeheader()
                    csv_data = []
                    for item in data['holds']:
                        row = item.copy()
                        if isinstance(row.get('center'), dict):
                            row['center'] = f"{row['center'].get('x')},{row['center'].get('y')}"
                        csv_data.append(row)
                    writer.writerows(csv_data)

            # 2. Update holds_data.json (and CSV)
            if 'metadata' in data:
                with open('docs/holds_data.json', 'w') as f:
                    json.dump(data['metadata'], f, indent=4)
                
                # Flatten metadata for CSV
                csv_rows = []
                for cell in sorted(data['metadata'].keys()):
                    cell_holds = data['metadata'][cell]
                    for hold_key in sorted(cell_holds.keys()):
                        csv_rows.append(cell_holds[hold_key])
                
                fieldnames = ['cell_x', 'cell_y', 'category', 'num', 'type', 'difficulty', 'handDifficulty', 'footDifficulty', 'footRating', 'generalUsability', 'direction', 'idealUsage', 'ideal', 'audited']
                with open('docs/holds_data.csv', 'w', newline='') as f:
                    writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
                    writer.writeheader()
                    writer.writerows(csv_rows)
                write_hold_spec_files(data['metadata'])

            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'status': 'success'}).encode())

        elif self.path == '/save_calibration':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data)

            with open('docs/calibration.json', 'w') as f:
                json.dump(data, f, indent=4)

            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'status': 'success'}).encode())

        elif self.path == '/save_measurements':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data)

            with open('docs/measurements.json', 'w') as f:
                json.dump(data, f, indent=4)

            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'status': 'success'}).encode())

        elif self.path == '/save_auto_log':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data)

            log_path = 'docs/ai_generation_log.json'
            existing_logs = []
            if os.path.exists(log_path):
                try:
                    with open(log_path, 'r') as f:
                        existing_logs = json.load(f)
                except:
                    pass

            existing_logs.append(data)
            with open(log_path, 'w') as f:
                json.dump(existing_logs, f, indent=4)

            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'status': 'success'}).encode())

        elif self.path == '/save_routes':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data)

            # Save all routes to a master JSON file
            with open('docs/all_routes.json', 'w') as f:
                json.dump(data, f, indent=4)

            # Save each route to its own CSV for easy reading
            for route in data:
                safe_name = "".join([c for c in route['name'] if c.isalnum() or c in (' ', '.', '_')]).strip()
                filename = f"docs/route_{safe_name}.csv"
                with open(filename, 'w', newline='') as f:
                    writer = csv.DictWriter(f, fieldnames=['hold_id', 'type'])
                    writer.writeheader()
                    for h_id, h_type in route['holds'].items():
                        writer.writerow({'hold_id': h_id, 'type': h_type})

            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'status': 'success'}).encode())

        elif self.path == '/save_holds':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data)

            # Save JSON
            with open('docs/hold_annotations.json', 'w') as f:
                json.dump(data, f, indent=4)

            # Save CSV - Robust field handling
            if data:
                all_keys = set()
                for item in data:
                    all_keys.update(item.keys())

                fieldnames = ['id', 'cell', 'cat', 'num', 'center', 'path']    
                for key in all_keys:
                    if key not in fieldnames:
                        fieldnames.append(key)

                with open('docs/hold_annotations.csv', 'w', newline='') as f:  
                    writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
                    writer.writeheader()
                    csv_data = []
                    for item in data:
                        row = item.copy()
                        if isinstance(row.get('center'), dict):
                            row['center'] = f"{row['center'].get('x')},{row['center'].get('y')}"
                        csv_data.append(row)
                    writer.writerows(csv_data)

            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'status': 'success'}).encode())       

def run():
    server_address = ('', PORT)
    httpd = http.server.HTTPServer(server_address, SaveHandler)
    print(f"Starting server on port {PORT}...")
    print(f"Open http://localhost:{PORT} in your browser.")
    httpd.serve_forever()

if __name__ == '__main__':
    run()
