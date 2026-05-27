import http.server
import json
import csv
import os
import urllib.parse
import sys

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
            # Decode URL characters (e.g. %20 -> space)
            decoded_path = urllib.parse.unquote(self.path.lstrip('/'))
            file_path = os.path.join(os.getcwd(), decoded_path)

            if os.path.exists(file_path) and os.path.isfile(file_path):        
                self.send_response(200)
                if file_path.endswith('.html'):
                    self.send_header('Content-type', 'text/html')
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
                
                fieldnames = ['cell_x', 'cell_y', 'category', 'num', 'type', 'difficulty', 'direction', 'ideal']
                with open('docs/holds_data.csv', 'w', newline='') as f:
                    writer = csv.DictWriter(f, fieldnames=fieldnames)
                    writer.writeheader()
                    writer.writerows(csv_rows)

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
