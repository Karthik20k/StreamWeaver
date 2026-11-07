# StreamWeaver: High-Throughput No-Code ETL Pipeline

StreamWeaver is an enterprise-grade, memory-safe ETL (Extract, Transform, Load) platform engineered to upload, transform, and ingest massive datasets (e.g., multi-gigabyte CSV or JSON files) into MongoDB without exceeding Node.js V8 memory limits (Heap Out of Memory) or freezing client browser tabs.

---

## 🎯 Problem Statement
Uploading and transforming massive datasets (e.g., 5GB CSV or JSON files) typically crashes web browsers or exhausts the Node.js V8 memory limit (~1.4GB default heap). Non-technical users need a reliable, visual way to upload, clean, map, and transform massive datasets into databases without writing custom backend scripts or crashing servers.

---

## 🏗️ Architecture & Key Modules

| Module | Technology | Role |
| :--- | :--- | :--- |
| **Native Node Streams** | `fs`, `stream.Transform`, `busboy` | Bypasses memory limits by streaming file chunks piece-by-piece rather than buffering the entire payload into RAM. |
| **Secure Sandbox** | `isolated-vm` | Safely executes user-defined JavaScript transformation rules in an isolated V8 context without exposing the Node runtime. |
| **Bulk Database Ingestion** | `MongoDB bulkWrite` | Buffers processed records and inserts them in high-efficiency batches of 1,000–5,000 to maximize database throughput. |
| **DOM Virtualization** | `react-window` / `react-virtualized` | Renders millions of rows smoothly by rendering only the visible viewport rows in the DOM. |
| **Real-Time Telemetry** | WebSockets (`socket.io` / `ws`) | Streams live progress (e.g., `rows processed/sec`, progress bar, memory footprint) back to the browser. |

---

## 📅 4-Week Development Roadmap

### Week 1: Ingestion & Virtual Preview
- **Backend**: Multipart streaming with `busboy` to accept high-volume file streams directly without saving the whole file in memory.
- **Frontend**: Virtualized grid (`react-window`) capable of previewing the first 1,000 rows without DOM sluggishness.

### Week 2: Transformation Streams & Field Mapping
- **Backend**: Node.js `stream.Transform` pipelines parsing CSV chunks on-the-fly and generating typed JSON documents.
- **Frontend**: Interactive column-mapping interface connecting source CSV headers to destination MongoDB document schemas.
- **Milestone Audit**: Stream a 2GB test file with memory profiling proving server RSS/heap stays well below 150MB.

### Week 3: Sandboxed Execution & Live Progress
- **Backend**: Integration of `isolated-vm` for user-defined inline JavaScript transformations (e.g., `return value.trim().toUpperCase()`).
- **Frontend**: WebSocket connection broadcasting live rows/sec ingestion rate, memory metrics, and progress bars.

### Week 4: Bulk Operations & Production Polish
- **Backend**: High-speed batch buffering triggering MongoDB `bulkWrite` operations every 5,000 records.
- **Frontend**: Robust error handling UI highlighting rows that failed schema validation or transformation constraints.

---

## 🚀 Repository Structure

```
StreamWeaver/
├── client/          # React frontend (Vite + React Virtualized Grid)
├── server/          # Node.js backend (Express + Native Streams + isolated-vm)
├── .gitignore
├── package.json     # Workspace management scripts
└── README.md
```

---

## 🛠️ Getting Started

### Prerequisites
- Node.js >= 18.x (Recommended: v20+ or v22+)
- MongoDB 5.0+

### Development Scripts
```bash
# Install root dependencies
npm install

# Run backend development server
npm run dev:server

# Run frontend development server
npm run dev:client
```
