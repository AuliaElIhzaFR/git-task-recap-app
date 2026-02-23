# Technical Documentation - Odoo Attendance Bot

## 📋 Table of Contents
- [Architecture Overview](#architecture-overview)
- [Authentication Flow](#authentication-flow)
- [Challenges & Solutions](#challenges--solutions)
- [API Endpoints](#api-endpoints)
- [Code Flow Diagram](#code-flow-diagram)

---

## 🏗️ Architecture Overview

Bot ini menggunakan **API-based approach** (bukan browser automation dengan Puppeteer) untuk:
- ✅ Performa lebih cepat
- ✅ Resource usage lebih efisien
- ✅ Maintenance lebih mudah
- ✅ Lebih reliable

### Tech Stack:
- **TypeScript** - Type-safe development
- **Axios** - HTTP client untuk API calls
- **node-telegram-bot-api** - Telegram Bot integration
- **dotenv** - Environment configuration

---

## 🔐 Authentication Flow

### Overview
```
User → Telegram → Bot → Odoo Login → Odoo API → Response → Telegram → User
```

### Detailed Flow

#### 1. **Get Cloudflare Cookies** (Step 0)
```typescript
GET https://apps.yasaweb.com/
```
**Why?** Odoo behind Cloudflare protection yang require cookies dari homepage.

**Response:**
- Status: 200
- Set-Cookie: `session_id=xxx`, `cf_clearance=yyy`

**Key Learning:** Direct request ke `/web/login` akan redirect loop tanpa Cloudflare cookies.

---

#### 2. **Get Login Page with CSRF Token** (Step 1)
```typescript
GET https://apps.yasaweb.com/web/login?db=stk
Headers:
  - Cookie: [Cloudflare cookies from Step 0]
  - Referer: https://apps.yasaweb.com/
```

**Why?** Odoo require CSRF token untuk security. Token ini embedded di HTML login page.

**Response:**
- Status: 302 → 200 (after following redirect)
- HTML page with CSRF token in input field
- New session_id cookie

**CSRF Token Extraction:**
```typescript
// Multiple patterns to handle different Odoo versions
Pattern 1: <input name="csrf_token" value="xxx">
Pattern 2: <input value="xxx" name="csrf_token">
Pattern 3: csrf_token: "xxx" (JavaScript)
Pattern 4: "csrf_token": "xxx" (JSON)
```

---

#### 3. **Submit Login Form** (Step 2)
```typescript
POST https://apps.yasaweb.com/web/login
Content-Type: application/x-www-form-urlencoded

Body:
  csrf_token: [from Step 1]
  db: stk
  login: user@email.com
  password: xxx
  type: password
  redirect: /odoo?db=stk

Headers:
  - Cookie: [All cookies: Cloudflare + session_id]
  - Referer: https://apps.yasaweb.com/web/login?db=stk
```

**Response:**
- Status: 303 (See Other)
- Location: `/odoo?db=stk` (success) OR `/web/database/selector` (failed)
- Set-Cookie: New authenticated session_id

**Success Indicators:**
- ✅ Status 303 redirect
- ✅ Location header contains `/web` or `/odoo`
- ✅ Location NOT contains `/web/database/selector`

---

#### 4. **Check-in/Check-out** (Using authenticated session)
```typescript
POST https://apps.yasaweb.com/hr_attendance/systray_check_in_out
Content-Type: application/json

Body: {
  "id": [random],
  "jsonrpc": "2.0",
  "method": "call",
  "params": {}
}

Headers:
  - Cookie: session_id=[authenticated session]
  - X-Requested-With: XMLHttpRequest
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 462,
  "result": {
    "attendance_state": "checked_in",  // or "checked_out"
    "employee_name": "Asraf Muhammad Izzudin",
    "hours_today": 0.02,
    "attendance": {
      "check_in": "2026-01-22 17:47:56",
      "check_out": "2026-01-22 17:48:50"
    }
  }
}
```

---

## 🚧 Challenges & Solutions

### Challenge 1: Cloudflare Protection - Infinite Redirect Loop

**Problem:**
```
GET /web/login?db=stk
→ 302 Redirect to: /web/login?db=stk (SAME URL!)
→ 302 Redirect to: /web/login?db=stk
→ ... (infinite loop)
```

**Root Cause:**
- Cloudflare protection blocking direct access
- Missing Cloudflare cookies from homepage

**Solution:**
```typescript
// Step 0: Get Cloudflare cookies FIRST
const homepage = await axios.get('https://apps.yasaweb.com/');
const cfCookies = homepage.headers['set-cookie'];

// Step 1: THEN access login page with cookies
const loginPage = await axios.get('/web/login?db=stk', {
  headers: { Cookie: cfCookies }
});
```

**Key Learning:** Always request homepage first when dealing with Cloudflare-protected sites.

---

### Challenge 2: Database Selector Redirect

**Problem:**
```
POST /web/login → 303 Redirect to: /web/database/selector
```

**Possible Causes:**
1. ❌ Wrong credentials
2. ❌ Database name doesn't exist
3. ❌ Missing database in URL query
4. ❌ CSRF token not sent
5. ❌ Missing/wrong cookies

**Solution:**
```typescript
// Ensure ALL required fields
const loginData = {
  csrf_token: token,     // ✅ Must have
  db: 'stk',             // ✅ Must specify
  login: email,          // ✅ Correct credentials
  password: password,    // ✅ Correct credentials
  type: 'password',      // ✅ Required by Odoo
  redirect: '/odoo?db=stk'
};

// Ensure ALL cookies sent
headers: {
  Cookie: [Cloudflare cookies + session_id]
}
```

---

### Challenge 3: CSRF Token Not Found

**Problem:**
```
Login page HTML doesn't contain CSRF token
→ HTML shows: "Redirecting..." page
```

**Root Cause:**
- Got HTML redirect page instead of actual login page
- Need to follow redirect to get real page

**Solution:**
```typescript
// Check if got redirect page
if (response.data.includes('Redirecting...')) {
  const redirectUrl = extractHref(response.data);
  
  // Follow redirect manually with cookies
  response = await axios.get(redirectUrl, {
    headers: { Cookie: previousCookies }
  });
}
```

---

### Challenge 4: Axios Redirect Loop with baseURL

**Problem:**
```typescript
axios.create({ baseURL: 'https://apps.yasaweb.com' })
→ Causes infinite redirect with maxRedirects
```

**Root Cause:**
- Axios with baseURL doesn't handle relative redirects properly
- Cloudflare redirects are relative URLs

**Solution:**
```typescript
// Use full URL instead of baseURL for login flow
await axios.get('https://apps.yasaweb.com/web/login?db=stk')

// OR handle redirects manually
axios.get(url, { maxRedirects: 0 })
  .then(resp => {
    if (resp.status === 302) {
      const location = resp.headers['location'];
      return axios.get(fullUrl(location));
    }
  })
```

---

### Challenge 5: Cookie Management Across Requests

**Problem:**
- Cookies dari homepage hilang saat request login page
- Session ID tidak updated setelah login

**Solution:**
```typescript
// Build cumulative cookie string
let cookieString = '';

// Step 0: Homepage cookies
cookieString = extractCookies(homepageResponse);

// Step 1: Merge with login page cookies
const newCookies = extractCookies(loginPageResponse);
cookieString = mergeCookies(cookieString, newCookies);

// Step 2: Use merged cookies for POST
axios.post('/web/login', data, {
  headers: { Cookie: cookieString }
});
```

---

## 📡 API Endpoints

### 1. **Homepage** (Cloudflare bypass)
```
GET https://apps.yasaweb.com/
```
- Purpose: Get Cloudflare cookies
- Auth: None
- Response: HTML + Set-Cookie

### 2. **Login Page** (CSRF token)
```
GET https://apps.yasaweb.com/web/login?db=stk
```
- Purpose: Get CSRF token
- Auth: Cloudflare cookies required
- Response: HTML with CSRF token input field

### 3. **Login Submit**
```
POST https://apps.yasaweb.com/web/login
Content-Type: application/x-www-form-urlencoded
```
- Purpose: Authenticate user
- Auth: CSRF token + session cookie
- Response: 303 redirect with authenticated session

### 4. **Attendance Action**
```
POST https://apps.yasaweb.com/hr_attendance/systray_check_in_out
Content-Type: application/json
```
- Purpose: Check-in or check-out
- Auth: Authenticated session cookie
- Response: JSON with attendance status

**Note:** Same endpoint handles both check-in and check-out. Odoo automatically toggles based on current state.

---

## 📊 Code Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     User sends /checkin                      │
│                     via Telegram Bot                         │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  TelegramBot.onText(/checkin/)                              │
│  → Send loading message                                      │
│  → Call odooService.checkIn()                               │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  OdooService.checkIn()                                      │
│  → Check if sessionId exists                                │
│  → If not, call login()                                     │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  OdooService.login()                                        │
│                                                             │
│  STEP 0: Get Cloudflare Cookies                            │
│  ┌────────────────────────────────────────┐                │
│  │ GET https://apps.yasaweb.com/         │                │
│  │ → Extract: session_id, cf_clearance   │                │
│  └────────────────────────────────────────┘                │
│                         │                                   │
│                         ▼                                   │
│  STEP 1: Get Login Page & CSRF Token                       │
│  ┌────────────────────────────────────────┐                │
│  │ GET /web/login?db=stk                  │                │
│  │ Headers: Cookie [from Step 0]          │                │
│  │                                         │                │
│  │ If 302 redirect:                       │                │
│  │   → Follow redirect with cookies       │                │
│  │                                         │                │
│  │ Extract from HTML:                     │                │
│  │   → CSRF token (5 patterns)            │                │
│  │   → session_id (updated)               │                │
│  └────────────────────────────────────────┘                │
│                         │                                   │
│                         ▼                                   │
│  STEP 2: Submit Login                                      │
│  ┌────────────────────────────────────────┐                │
│  │ POST /web/login                        │                │
│  │ Body: {                                │                │
│  │   csrf_token, db, login,               │                │
│  │   password, type, redirect             │                │
│  │ }                                       │                │
│  │ Headers: Cookie [all cookies merged]   │                │
│  │                                         │                │
│  │ Response: 303 Redirect                 │                │
│  │   ✅ /odoo?db=stk → Success            │                │
│  │   ❌ /web/database/selector → Failed   │                │
│  │                                         │                │
│  │ Extract: New authenticated session_id  │                │
│  └────────────────────────────────────────┘                │
│                                                             │
│  Return: true (success) or false (failed)                  │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  OdooService.checkIn() - continued                          │
│                                                             │
│  POST /hr_attendance/systray_check_in_out                  │
│  ┌────────────────────────────────────────┐                │
│  │ Body: JSON-RPC request                 │                │
│  │ Headers: {                             │                │
│  │   Cookie: session_id=[authenticated]   │                │
│  │   X-Requested-With: XMLHttpRequest     │                │
│  │ }                                       │                │
│  │                                         │                │
│  │ Response: {                            │                │
│  │   result: {                            │                │
│  │     attendance_state: "checked_in",    │                │
│  │     employee_name: "...",              │                │
│  │     hours_today: 0.02                  │                │
│  │   }                                     │                │
│  │ }                                       │                │
│  └────────────────────────────────────────┘                │
│                                                             │
│  Return: { success: true, message: "..." }                 │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  TelegramBot - Send Result                                  │
│  → Delete loading message                                   │
│  → Send success message with timestamp                      │
│  → User receives notification                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎯 Key Takeaways

### 1. **Why Not Puppeteer?**
- ❌ Heavy (requires Chrome browser)
- ❌ Slow (need to load full page)
- ❌ Fragile (UI changes break code)
- ✅ API is faster, lighter, more stable

### 2. **Cookie Management is Critical**
- Must preserve cookies across ALL requests
- Cloudflare cookies + Session cookies must be sent together
- Update cookies from each response

### 3. **CSRF Token is Mandatory**
- Odoo won't accept login without valid CSRF token
- Token is embedded in HTML, need to extract
- Use multiple patterns to handle different Odoo versions

### 4. **Cloudflare Protection**
- Cannot bypass directly
- Must request homepage first to get cookies
- Always include User-Agent header

### 5. **Manual Redirect Handling**
- Axios auto-redirect can cause loops with Cloudflare
- Better to handle redirects manually with `maxRedirects: 0`
- Always check redirect location to detect success/failure

---

## 🔍 Debugging Tips

### Enable Detailed Logging
Already implemented in code:
```typescript
console.log('📡 Requesting:', url);
console.log('📊 Response status:', status);
console.log('🍪 Cookies:', cookies);
console.log('📍 Redirect location:', location);
```

### Common Issues Checklist
- [ ] Cloudflare cookies sent?
- [ ] CSRF token extracted?
- [ ] All cookies merged correctly?
- [ ] Correct database name in URL?
- [ ] Valid credentials?
- [ ] Redirect to success URL?

### Test Manually with cURL
```bash
# Test login
curl -v -X POST 'https://apps.yasaweb.com/web/login' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-raw 'csrf_token=xxx&db=stk&login=email&password=pass'

# Test attendance
curl 'https://apps.yasaweb.com/hr_attendance/systray_check_in_out' \
  -H 'Cookie: session_id=xxx' \
  -H 'Content-Type: application/json' \
  --data-raw '{"id":1,"jsonrpc":"2.0","method":"call","params":{}}'
```

---

## 📚 References

- [Odoo Documentation](https://www.odoo.com/documentation/)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Axios Documentation](https://axios-http.com/)
- [JSON-RPC Specification](https://www.jsonrpc.org/specification)

---

**Built with ❤️ by solving real-world authentication challenges**
