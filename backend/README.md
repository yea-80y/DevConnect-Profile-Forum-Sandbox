This is the LEAN server-only package:
- Includes: src/app/api/**, server libs (forum/moderation/profile), src/config/**
- Excludes: UI pages, components, client-only libs
- Modified: package.json postinstall hook removed (patch-package not needed on server)

Security:
- Never expose FEED_PRIVATE_KEY/SESSION_SECRET to clients.
- Clients on Swarm call these routes via NEXT_PUBLIC_API_URL.
