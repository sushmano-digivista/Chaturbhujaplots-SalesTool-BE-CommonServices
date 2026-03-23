/**
 * siteVisit.service.js
 * Sends site visit confirmation emails + WhatsApp messages to:
 *   - Customer (if email/phone provided)
 *   - Property owner (always, using OWNER_EMAIL / OWNER_PHONE from .env)
 */
const nodemailer = require('nodemailer')
const axios      = require('axios')

const OWNER_EMAIL = process.env.OWNER_EMAIL || 'info@chaturbhuja.in'
const OWNER_PHONE = process.env.OWNER_PHONE || '918977262683'  // E.164 without +
const SITE_URL    = process.env.SITE_URL    || 'https://chaturbhuja.in'

function createTransport() {
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST   || 'smtp.gmail.com',
    port:   Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  })
}

const HEADER_HTML = `
  <div style="background:#1E4D2B;padding:24px 32px;">
    <h2 style="color:#C9A84C;margin:0;font-size:20px;">Chaturbhuja Properties & Infra</h2>
    <p style="color:rgba(255,255,255,0.65);margin:4px 0 0;font-size:12px;">
      Premium Open Plots · Andhra Pradesh · +91 89772 62683
    </p>
  </div>`

const FOOTER_HTML = `
  <div style="padding:16px 32px;background:#f0ede4;text-align:center;
              font-size:11px;color:#888;border-top:1px solid #ddd;">
    Chaturbhuja Properties & Infra · Vijayawada, AP ·
    <a href="${SITE_URL}" style="color:#1E4D2B;">${SITE_URL.replace('https://', '')}</a>
  </div>`

// ── Customer confirmation email ────────────────────────────────────────────
async function sendCustomerEmail({ email, name, project, date, phone }) {
  if (!email) return null
  const transporter = createTransport()
  return transporter.sendMail({
    from:    `"Chaturbhuja Properties & Infra" <${process.env.SMTP_USER}>`,
    to:      email,
    subject: `Site Visit Confirmed — ${project || 'Chaturbhuja Properties'} | ${date}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        ${HEADER_HTML}
        <div style="padding:28px 32px;background:#fafaf7;border:1px solid #e8e5dc;">
          <p style="font-size:16px;color:#1a1a1a;">Dear ${name},</p>
          <p style="color:#444;line-height:1.7;">
            Your site visit has been <strong style="color:#1E4D2B;">confirmed</strong>. 
            Our team will be ready to welcome you!
          </p>
          <table style="width:100%;border-collapse:collapse;margin:20px 0;
                        border:1px solid #e0ddd4;border-radius:8px;overflow:hidden;">
            <tr style="background:#f5f2e8;">
              <td style="padding:12px 16px;font-weight:600;color:#444;width:40%;border-bottom:1px solid #e0ddd4;">Project</td>
              <td style="padding:12px 16px;color:#1E4D2B;font-weight:700;border-bottom:1px solid #e0ddd4;">${project || 'Chaturbhuja Properties'}</td>
            </tr>
            <tr>
              <td style="padding:12px 16px;font-weight:600;color:#444;border-bottom:1px solid #e0ddd4;">Preferred Date</td>
              <td style="padding:12px 16px;color:#1a1a1a;border-bottom:1px solid #e0ddd4;">${date}</td>
            </tr>
            ${phone ? `<tr>
              <td style="padding:12px 16px;font-weight:600;color:#444;">Your Number</td>
              <td style="padding:12px 16px;color:#1a1a1a;">${phone}</td>
            </tr>` : ''}
          </table>
          <p style="color:#666;font-size:13px;line-height:1.7;">
            Our executive will call you a day before to confirm the exact time and meeting point.
            For any queries, call us at <strong>+91 89772 62683</strong>.
          </p>
        </div>
        ${FOOTER_HTML}
      </div>`,
  })
}

// ── Owner notification email ───────────────────────────────────────────────
async function sendOwnerEmail({ name, phone, email, project, date }) {
  const transporter = createTransport()
  return transporter.sendMail({
    from:    `"Chaturbhuja CRM" <${process.env.SMTP_USER}>`,
    to:      OWNER_EMAIL,
    subject: `🏠 New Site Visit — ${name} | ${project || 'Any'} | ${date}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        ${HEADER_HTML}
        <div style="padding:28px 32px;background:#fafaf7;border:1px solid #e8e5dc;">
          <h3 style="color:#1E4D2B;margin-top:0;">New Site Visit Booking</h3>
          <table style="width:100%;border-collapse:collapse;border:1px solid #e0ddd4;border-radius:8px;overflow:hidden;">
            <tr style="background:#f5f2e8;">
              <td style="padding:10px 16px;font-weight:600;color:#444;width:35%;border-bottom:1px solid #e0ddd4;">Customer</td>
              <td style="padding:10px 16px;color:#1a1a1a;border-bottom:1px solid #e0ddd4;"><strong>${name}</strong></td>
            </tr>
            <tr>
              <td style="padding:10px 16px;font-weight:600;color:#444;border-bottom:1px solid #e0ddd4;">Mobile</td>
              <td style="padding:10px 16px;border-bottom:1px solid #e0ddd4;">
                <a href="tel:+91${phone}" style="color:#1E4D2B;">${phone}</a>
              </td>
            </tr>
            ${email ? `<tr>
              <td style="padding:10px 16px;font-weight:600;color:#444;border-bottom:1px solid #e0ddd4;">Email</td>
              <td style="padding:10px 16px;border-bottom:1px solid #e0ddd4;">
                <a href="mailto:${email}" style="color:#1E4D2B;">${email}</a>
              </td>
            </tr>` : ''}
            <tr style="background:#f5f2e8;">
              <td style="padding:10px 16px;font-weight:600;color:#444;border-bottom:1px solid #e0ddd4;">Project</td>
              <td style="padding:10px 16px;color:#1E4D2B;font-weight:700;border-bottom:1px solid #e0ddd4;">${project || 'Not specified'}</td>
            </tr>
            <tr>
              <td style="padding:10px 16px;font-weight:600;color:#444;">Preferred Date</td>
              <td style="padding:10px 16px;color:#d93025;font-weight:700;">${date}</td>
            </tr>
          </table>
        </div>
        ${FOOTER_HTML}
      </div>`,
  })
}

// ── WhatsApp helper ────────────────────────────────────────────────────────
async function sendWhatsApp(toPhone, message) {
  const waToken   = process.env.WA_TOKEN
  const waPhoneId = process.env.WA_PHONE_ID
  const clean     = toPhone.replace(/[^0-9]/g, '')
  const e164      = clean.startsWith('91') ? clean : `91${clean}`

  if (waToken && waPhoneId) {
    const res = await axios.post(
      `https://graph.facebook.com/v19.0/${waPhoneId}/messages`,
      { messaging_product:'whatsapp', to:e164, type:'text', text:{ body:message } },
      { headers: { Authorization:`Bearer ${waToken}`, 'Content-Type':'application/json' } }
    )
    return { method:'cloud_api', id: res.data?.messages?.[0]?.id }
  }
  // Fallback: return wa.me link
  return { method:'deeplink', deepLink:`https://wa.me/${e164}?text=${encodeURIComponent(message)}` }
}

// ── Customer WhatsApp ──────────────────────────────────────────────────────
async function sendCustomerWhatsApp({ phone, name, project, date }) {
  if (!phone) return null
  const msg = `Hello ${name}! 👋\n\n` +
    `Your site visit to *${project || 'Chaturbhuja Properties'}* has been confirmed ✅\n\n` +
    `📅 *Preferred Date:* ${date}\n\n` +
    `Our executive will call you a day before to confirm the exact time.\n` +
    `For queries: 📞 +91 89772 62683\n\n` +
    `_Chaturbhuja Properties & Infra — Premium Plots · AP_`
  return sendWhatsApp(phone, msg)
}

// ── Owner WhatsApp ─────────────────────────────────────────────────────────
async function sendOwnerWhatsApp({ name, phone, email, project, date }) {
  const msg = `🏠 *New Site Visit Booking*\n\n` +
    `👤 *Customer:* ${name}\n` +
    `📞 *Mobile:* ${phone}\n` +
    `${email ? `📧 *Email:* ${email}\n` : ''}` +
    `🏡 *Project:* ${project || 'Not specified'}\n` +
    `📅 *Preferred Date:* ${date}\n\n` +
    `Please call the customer to confirm the visit time.`
  return sendWhatsApp(OWNER_PHONE, msg)
}

module.exports = {
  sendCustomerEmail,
  sendOwnerEmail,
  sendCustomerWhatsApp,
  sendOwnerWhatsApp,
}
