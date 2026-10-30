# WhatsApp OTP Template Setup & Approval Guide (Reltigrow Business API)

This guide documents the exact configuration required to create, submit for Meta approval, and activate the WhatsApp OTP verification template in the Reltigrow WhatsApp Business portal.

---

## 1. Template Metadata Specification

| Field | Exact Value Required | Notes |
| :--- | :--- | :--- |
| **Template Name** | `flowtrack_signup_otp` | Lowercase with underscores only; no spaces or dashes |
| **Category** | `AUTHENTICATION` | Meta OTP Authentication category |
| **Language** | `en` (English) | Standard US / International English |
| **Header** | None | Authentication templates must not have headers |
| **Footer** | `FlowTrack Secure Access` *(optional)* | Short identifier footer |
| **Expiry Notice** | `5 minutes` | Matches FlowTrack's 5-minute TTL security policy |

---

## 2. Template Content & Variable Mapping

### Body Text
```text
{{1}} is your verification code. For your security, do not share this code.

This code expires in 5 minutes.
```

### Variable Definition
- **`{{1}}`**: 6-digit numeric verification code (e.g. `482915`). Automatically populated by the backend `ReltigrowWhatsAppChannel`.

### Interactive Button (Copy Code)
- **Button Type**: `OTP / COPY_CODE`
- **Button Label**: `Copy Code`
- **Button Action**: Copies the 6-digit one-time code to the user's mobile clipboard on touch.

---

## 3. Step-by-Step Approval Instructions in Reltigrow Dashboard

1. **Log in to Reltigrow Console**:
   - Navigate to the [Reltigrow WhatsApp Portal](https://whatsapp.reltigrow.com/).
   - Authenticate with your enterprise workspace credentials.
2. **Access Template Management**:
   - Go to **WhatsApp Business API > Message Templates**.
   - Click **+ Create Template**.
3. **Configure Template**:
   - Name: `flowtrack_signup_otp`
   - Category: Select **Authentication** (do not select Marketing or Utility).
   - Language: Select **English (en)**.
4. **Enter Body & Button**:
   - Paste the body text:
     ```text
     {{1}} is your verification code. For your security, do not share this code.
     ```
   - Add a Copy Code button: Choose **Quick Action > Copy Code**.
5. **Add Sample Value for Meta Review**:
   - In the sample value field for `{{1}}`, enter: `123456`.
6. **Submit for Meta Approval**:
   - Click **Submit for Review**.
   - Meta automated approval for standard `AUTHENTICATION` templates typically takes **2 to 15 minutes**.
7. **Verify Approved Status**:
   - Once the status switches to **APPROVED (Active)** in the Reltigrow dashboard, the template is live and ready for outbound traffic.

---

## 4. Production Environment Configuration

Once approved, ensure your production `.env` (or environment secrets in Render / Cloudflare) contains:

```env
# Reltigrow WhatsApp API
RELTIGROW_API_URL=https://whatsapp.reltigrow.com/api/v2
RELTIGROW_API_KEY=your_actual_reltigrow_api_key
RELTIGROW_OTP_TEMPLATE=flowtrack_signup_otp
RELTIGROW_OTP_LANGUAGE=en
ALLOW_CONSOLE_OTP_IN_PRODUCTION=false
```

If your approved template name differs (e.g., `flowtrack_otp_v1`), simply update the `RELTIGROW_OTP_TEMPLATE` environment variable without changing any application code.
