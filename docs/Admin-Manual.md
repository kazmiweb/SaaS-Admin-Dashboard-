# Admin Manual — Elookup Intelligence Search (Starter)

## Admin Login
Use seeded admin account:
- admin@elookup.local / Admin@12345

## Add API
1. Go to Admin → API Management
2. Click "Add New API"
3. Fill:
- API Name
- Method (GET/POST)
- Base URL + Endpoint
- Query Param Name
- Supported query types (CNIC/Phone/Reg/Engine/Chassis/License)
- Cost per search
- Allowed roles
4. Save
5. Use "Test" with a sample query

## Assign API to a Service
In this starter, APIs are assigned during Service creation.
- Create service → select API IDs
- For existing mapping, adjust in DB or extend UI (TODO in frontend)

## Credits / Expiry
- In this starter, credit editing is scaffolded in DB; extend Admin UI next:
  - Add credits/remove credits
  - Set expiry packages
  - Transaction logging

## Zero Credit Message
Controlled by env:
- CONTACT_TELEGRAM
- CONTACT_EMAIL

## IP Blocking
Add rows to `IPList` table:
- type = BLACKLIST or WHITELIST

