# YouTube Video Finder

A small browser app that searches YouTube for a learning topic and ranks videos by how likely they are to be useful and information-rich.

## What it does

- Collects a search topic and a YouTube Data API v3 key from the user.
- Searches YouTube for embeddable videos related to the topic.
- Fetches each video's details, duration, and statistics.
- Scores videos using keyword overlap, YouTube search position, runtime, description depth, views, and likes.
- Displays ranked video cards with thumbnails, metrics, and a short explanation of why each result ranked well.

## Run locally

Because the app is static HTML, CSS, and JavaScript, you can run it with any local static server:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000> in your browser.

## YouTube API key

The app calls the YouTube Data API v3 directly from the browser. Create an API key in Google Cloud, enable the YouTube Data API v3, and paste the key into the form. The key is only used in your current browser session and is not stored by this app.
