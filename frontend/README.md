# Vocabulary Essay Analyzer - Frontend

React + TypeScript frontend for the Vocabulary Essay Analyzer application.

## Features

- **Essay Upload**: Paste essay text directly into the interface
- **Real-time Processing Status**: Visual indicators for processing states
- **Metrics Display**: Word count, unique words, type-token ratio, and POS distribution
- **Word-Level Feedback**: Detailed feedback on vocabulary usage from Claude 3

## Tech Stack

- **React 19** with TypeScript
- **Vite** for build tooling
- **Tailwind CSS** for styling
- **Lucide React** for icons

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### Build

```bash
npm run build
```

### Environment Variables

Create a `.env` file in the frontend directory:

```env
VITE_API_URL=https://3uyr4x1nta.execute-api.us-east-1.amazonaws.com/prod
```

If not set, it defaults to the production API URL.

## Usage

1. Paste your essay text into the textarea
2. Click "Analyze Essay"
3. Wait for processing (typically ~30-40 seconds)
4. View metrics and word-level feedback

## Project Structure

```
frontend/
├── src/
│   ├── lib/
│   │   ├── api.ts          # API client functions
│   │   └── utils.ts        # Utility functions
│   ├── App.tsx             # Main application component
│   ├── main.tsx            # Entry point
│   └── index.css           # Global styles (Tailwind)
├── public/                 # Static assets
└── package.json
```
