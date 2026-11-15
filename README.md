# AirDraw — Camera-Controlled Infinite Whiteboard

An Excalidraw-style infinite whiteboard driven by real-time webcam hand gestures, with full mouse/touch fallback. Runs 100% client-side in the browser with zero backend servers, logins, or cloud storage.

## Features

- **Air-Drawing & Auto-Snapping:** Pinch your index finger and thumb to sketch freehand strokes that automatically snap into clean rectangles, circles, lines, or dynamic arrows connecting two objects.
- **Two-Handed Gesture Controls:**
  - **Index + Thumb Pinch:** Draw strokes and snap shapes/connectors (protected by a 110ms dwell timer and movement deadzone to prevent accidental marks).
  - **Middle + Thumb Pinch:** Grab and reposition existing shapes while keeping attached connectors linked.
  - **Closed Fist:** Pan across the infinite canvas.
  - **Two-Hand Pinch:** Smoothly zoom and pan around the midpoint between both hands.
  - **1–5 Fingers (Support Hand / Hold):** Switch between AMOLED stroke colors (`Auto White/Black`, `Electric Blue`, `Neon Green`, `Cyber Amber`, `Neon Pink`).
- **Inline Text & Handwriting Typography:** Double-click inside any shape or anywhere on the canvas to type labels in a hand-lettered font.
- **AMOLED Dark & Light Themes:** Toggle between a `#000000` pitch-black AMOLED canvas and a crisp light theme.
- **Local `.airdraw` Save & Open:** Export the entire board state (viewport, theme, shapes, text, and connectors) as a `.airdraw` JSON file on your computer and reopen it anytime.
- **Interactive Gesture Guide:** Built-in animated tutorial modal demonstrating every hand pose.

## Tech Stack

- **Frontend:** React, TypeScript, Vite, HTML5 Canvas
- **Computer Vision:** `@mediapipe/tasks-vision` (`HandLandmarker`)
- **Signal Processing & Geometry:** One-Euro adaptive filter, Ramer-Douglas-Peucker simplification, Shoelace area classification

## Local Development

```bash
npm install
npm run dev
```

## Visit
[![Live Demo](https://img.shields.io/badge/Live%20Demo-airdraw--board.vercel.app-00B4FF?style=for-the-badge&logo=vercel&logoColor=white)](https://airdraw-board.vercel.app)
