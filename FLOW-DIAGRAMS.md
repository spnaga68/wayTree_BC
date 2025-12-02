# 🔄 Authentication Flow Diagram

## Complete Flow from Start to API Call

```
START
  ↓
┌─────────────────────────────────────────────────┐
│ STEP 1: Import Collection                       │
│ • Download Auth-API.postman_collection.json     │
│ • Open Postman                                  │
│ • Click Import → Select File                    │
│ • Collection appears in sidebar                 │
│ ✅ RESULT: Auth API folder visible              │
└─────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────┐
│ STEP 2: Request OTP                             │
│ • Go to: 🔐 AUTHENTICATION                      │
│ • Click: "1. Request OTP"                       │
│ • Body: {"email": "your@email.com"}             │
│ • Click: Send                                   │
│ ✅ RESULT: {"success": true}                    │
│ ✅ OTP sent (123456 in dev mode)                │
└─────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────┐
│ STEP 3: Verify OTP & Get Token                  │
│ • Go to: 🔐 AUTHENTICATION                      │
│ • Click: "2. Verify OTP & Get Token"            │
│ • Body OTP: 123456 (dev mode)                   │
│ • Click: Send                                   │
│ ⚙️ SCRIPT RUNS:                                  │
│   - Parses response                             │
│   - Extracts token field                        │
│   - Saves to {{authToken}} variable             │
│   - Saves user info                             │
│   - Logs success to console                     │
│ ✅ RESULT: {"token": "xyz...", user: {...}}     │
│ ✅ TOKEN SAVED AUTOMATICALLY!                   │
└─────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────┐
│ TOKEN NOW AVAILABLE                             │
│ {{authToken}} = "eyJhbGciOiJIUzI1NiIsInR5..."   │
│                                                 │
│ Variable saved in:                              │
│ • Postman environment (session)                 │
│ • Collection variables (persistent)             │
│ • Both for redundancy!                          │
└─────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────┐
│ STEP 4: Call Protected API                      │
│ • Go to: 👤 USER PROFILE                        │
│ • Click: "Get My Profile"                       │
│ • Authorization Tab:                            │
│   Type: Bearer {{authToken}} ← AUTO-ADDED!      │
│ • Click: Send                                   │
│ ✅ RESULT: 200 OK                               │
│ ✅ Your profile data returned!                  │
│ ✅ NO "No token provided" error!                │
└─────────────────────────────────────────────────┘
  ↓
SUCCESS! 🎉
  ↓
Now you can use ANY endpoint:
  • PUT /me
  • POST /network-codes
  • GET /network-codes
  • POST /connections/connect
  • PUT /connections/:id/status
  • etc... (25+ endpoints)

All automatically use {{authToken}}!
```

---

## API Call Structure

```
CLIENT (Your Postman)
        ↓
    REQUEST
        ↓
    ┌───────────────────────────────┐
    │ POST /me                      │
    │ ─────────────────────────────│
    │ Authorization:                │
    │   Bearer {{authToken}}        │
    │   (auto-added by Postman)    │
    │ ─────────────────────────────│
    │ Content-Type:                 │
    │   application/json            │
    │ ─────────────────────────────│
    │ Body:                         │
    │ {                             │
    │   "name": "John Doe",         │
    │   "role": "founder"           │
    │ }                             │
    └───────────────────────────────┘
        ↓
    API SERVER
        ↓
    CHECK TOKEN
    ├─ Valid? → Continue
    └─ Invalid? → 401 Error
        ↓
    PROCESS REQUEST
        ↓
    RETURN RESPONSE
    ┌───────────────────────────────┐
    │ 200 OK                        │
    │ ─────────────────────────────│
    │ {                             │
    │   "id": "507f1f...",          │
    │   "email": "user@email.com",  │
    │   "name": "John Doe",         │
    │   "role": "founder",          │
    │   ...                         │
    │ }                             │
    └───────────────────────────────┘
        ↓
    CLIENT RECEIVES DATA
        ↓
    SUCCESS! ✅
```

---

## Token Lifecycle

```
Time: 0 minutes
├─ User state: Not authenticated
├─ Token variable: Empty
└─ Status: No API access

    ↓ (User requests OTP)

Time: 1 minute
├─ OTP sent to email
├─ Token variable: Still empty
└─ Status: Waiting for OTP verification

    ↓ (User verifies OTP with 123456)

Time: 2 minutes
├─ OTP verification successful
├─ API generates JWT token
├─ Postman script extracts token
├─ Token saved to {{authToken}}
├─ Console logs: "✅ Token saved!"
└─ Status: ✅ Ready to use APIs!

    ↓ (User calls protected endpoint)

Time: 3 minutes to 30 days
├─ Each request includes token
├─ API validates token
├─ Request succeeds if token valid
├─ Token remains valid
└─ Status: ✅ Full API access

    ↓ (30 days pass)

Time: 30 days
├─ Token expires
├─ Next API call returns 401
├─ Token variable becomes invalid
└─ Status: ❌ Need new token

    ↓ (User verifies OTP again)

Time: 30 days + 2 minutes
├─ New token generated
├─ Postman script extracts new token
├─ Token saved to {{authToken}}
├─ Console logs: "✅ Token saved!"
└─ Status: ✅ Back to full access!
```

---

## Variable Assignment Flow

```
BEFORE AUTHENTICATION
┌──────────────────────────────────┐
│ Collection Variables             │
├──────────────────────────────────┤
│ baseUrl:    "https://cpt4x27j..." │
│ authToken:  ""                   │
│ userId:     ""                   │
│ userEmail:  ""                   │
└──────────────────────────────────┘
         ↑
    (all empty)


AFTER VERIFY OTP
┌──────────────────────────────────────────────────┐
│ API Response from POST /auth/verify-otp          │
├──────────────────────────────────────────────────┤
│ {                                                 │
│   "token": "eyJhbGciOiJIUzI1NiIs...",          │
│   "isNewUser": false,                            │
│   "user": {                                       │
│     "id": "507f1f77bcf86cd799439011",           │
│     "email": "user@example.com",                 │
│     "name": "John Doe",                          │
│     ...                                           │
│   }                                               │
│ }                                                 │
└──────────────────────────────────────────────────┘
         ↓
   SCRIPT EXTRACTS DATA
         ↓
┌──────────────────────────────────────────────────┐
│ Collection Variables (UPDATED)                    │
├──────────────────────────────────────────────────┤
│ baseUrl:    "https://cpt4x27j-3000..."          │
│ authToken:  "eyJhbGciOiJIUzI1NiIs..."          │
│ userId:     "507f1f77bcf86cd799439011"          │
│ userEmail:  "user@example.com"                   │
└──────────────────────────────────────────────────┘
         ↓
   NOW READY FOR API CALLS!
```

---

## Request Authorization Header Sequence

```
REQUEST STRUCTURE:
┌────────────────────────────────────────┐
│ GET /me                                 │
├────────────────────────────────────────┤
│ Authorization: Bearer {{authToken}}     │
│                       ↑                 │
│               Reference to variable     │
├────────────────────────────────────────┤
│ Content-Type: application/json          │
└────────────────────────────────────────┘
         ↓
POSTMAN PROCESSES:
  1. See {{authToken}} in header
  2. Look up variable value
  3. Find: "eyJhbGciOiJIUzI1NiIs..."
  4. Replace {{authToken}} with actual token
         ↓
ACTUAL REQUEST SENT:
┌────────────────────────────────────────┐
│ GET /me                                 │
├────────────────────────────────────────┤
│ Authorization: Bearer eyJhbGciOiJIUzI1... │
│                      ↑                 │
│              Actual token value         │
├────────────────────────────────────────┤
│ Content-Type: application/json          │
└────────────────────────────────────────┘
         ↓
API VALIDATES:
  1. Extract token from Authorization header
  2. Verify token signature
  3. If valid → Process request
  4. If invalid → Return 401 error
         ↓
API RETURNS:
  200 OK with user data (if valid)
  401 Unauthorized (if invalid)
```

---

## Troubleshooting Decision Tree

```
ERROR: "No token provided"
  ├─ Did you authenticate? (run verify OTP)
  │  ├─ No → Go authenticate first
  │  └─ Yes → Continue
  │
  ├─ Check Postman Console
  │  ├─ See "✅ Token saved!"? → Good, move on
  │  └─ Don't see it? → Token not saved, re-authenticate
  │
  └─ Manual fix:
     ├─ Right-click collection → Edit
     ├─ Go to Variables tab
     ├─ Set authToken to your token value
     └─ Try again

ERROR: "Invalid or expired token"
  ├─ Token is 30 days old
  │  └─ Go authenticate again (verify OTP)
  │
  └─ Or token corrupted
     ├─ Clear {{authToken}} variable
     ├─ Re-authenticate (verify OTP)
     └─ Try again

ERROR: "Unauthorized"
  ├─ Check if endpoint is protected
  │  ├─ Need auth? Check Authorization header
  │  └─ Public? No header needed
  │
  └─ If protected:
     ├─ Make sure {{authToken}} is set
     └─ Re-authenticate if needed

SUCCESS: 200 OK
  ├─ Token is valid ✅
  ├─ Endpoint is correct ✅
  └─ Request body (if any) is correct ✅
```

---

## Complete Workflow Summary

```
┌─────────────────────────────────────────────────────────┐
│                    WORKFLOW SUMMARY                     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ START → IMPORT → REQUEST OTP → VERIFY OTP               │
│         ↓        ↓              ↓                        │
│      Success   Success        ✅ TOKEN SAVED            │
│                                ↓                        │
│                    ┌─────────────────────┐              │
│                    │   Token Available   │              │
│                    │ {{authToken}} ready │              │
│                    └─────────────────────┘              │
│                            ↓                            │
│        ┌───────────────────────────────────┐            │
│        │   CHOOSE PROTECTED ENDPOINT       │            │
│        └───────────────────────────────────┘            │
│        ↓               ↓               ↓                │
│    GET /me         POST /conn      POST /network       │
│        ↓               ↓               ↓                │
│    Success         Success         Success             │
│        ↓               ↓               ↓                │
│   Profile       New Connection    New Network          │
│        │               │               │                │
│        └───────────────┴───────────────┘                │
│                       ↓                                 │
│        ┌──────────────────────────┐                    │
│        │ USE RESPONSE DATA        │                    │
│        │ • View data              │                    │
│        │ • Copy IDs for next call │                    │
│        │ • Continue API workflow  │                    │
│        └──────────────────────────┘                    │
│                       ↓                                 │
│                  SUCCESS! 🎉                            │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## Error Resolution Paths

```
ERROR RECEIVED
    ↓
401 Unauthorized?
├─ No token provided
│  ├─ Run Step: Verify OTP & Get Token
│  └─ Confirm console shows "✅ Token saved!"
│
├─ Invalid/expired token
│  ├─ Token is 30 days old
│  └─ Run Step: Verify OTP & Get Token (again)
│
└─ Forbidden (you don't own this)
   └─ Check endpoint documentation
   
400 Bad Request?
├─ Invalid input format
│  └─ Check request body JSON structure
│
├─ Missing required field
│  └─ Verify all required fields present
│
└─ Invalid parameter value
   └─ Check field values against docs

404 Not Found?
├─ Wrong endpoint path
│  └─ Verify exact endpoint URL
│
└─ Resource doesn't exist
   └─ Check if ID is correct

500 Server Error?
└─ Server error
   └─ Try again or contact support

200 OK
└─ SUCCESS! ✅
   └─ Process the response data
```

---

**For more details, see the full documentation files!** 📚
