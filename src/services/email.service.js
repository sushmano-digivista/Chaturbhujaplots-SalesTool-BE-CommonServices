/**
 * email.service.js
 * Sends brochure download link via SMTP (Nodemailer).
 *
 * Security fix (CWE-80 / Sonar S5131):
 *   All user-supplied values are HTML-escaped via escapeHtml() before
 *   being interpolated into the email HTML body to prevent stored XSS.
 */
const nodemailer = require('nodemailer')
const { escapeHtml, sanitizeText } = require('../utils/sanitize')

const BROCHURE_URLS = {
  anjana:  'https://chaturbhuja.in/brochures/Anjana_Paradise_Brochure.pdf',
  aparna:  'https://chaturbhuja.in/brochures/Aparna_Legacy_Brochure.pdf',
  varaha:  'https://chaturbhuja.in/brochures/Varaha_Virtue_Brochure.pdf',
  trimbak: 'https://chaturbhuja.in/brochures/Trimbak_Oaks_Brochure.pdf',
  general: 'https://chaturbhuja.in/brochures/Chaturbhuja_Overview_Brochure.pdf',
}

// Allowed project IDs — prevent open-redirect via brochureUrl (Checkmarx CWE-601)
const ALLOWED_PROJECT_IDS = new Set(Object.keys(BROCHURE_URLS))

function createTransport() {
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST   || 'smtp.gmail.com',
    port:   Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })
}

/**
 * sendBrochureEmail({ to, name, projectId, projectName })
 * Returns { success: true, messageId } or throws.
 */
async function sendBrochureEmail({ to, name, projectId, projectName }) {
  // Only use known project IDs — fall back to 'general' for anything else
  const safeProjectId = ALLOWED_PROJECT_IDS.has(projectId) ? projectId : 'general'
  const brochureUrl   = BROCHURE_URLS[safeProjectId]

  // Escape all user-supplied values before HTML interpolation (CWE-80)
  const safeName    = escapeHtml(sanitizeText(name)) || 'Valued Customer'
  const safeProject = escapeHtml(sanitizeText(projectName)) || 'our open-plot ventures'

  const transporter = createTransport()
  const info = await transporter.sendMail({
    from:    `"Chaturbhuja Properties & Infra" <${process.env.SMTP_USER}>`,
    to,
    subject: `Your Brochure — ${safeProject} | Chaturbhuja Properties`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1E4D2B; padding: 28px 32px;">
          <h2 style="color: #C9A84C; margin: 0; font-size: 22px;">Chaturbhuja Properties &amp; Infra</h2>
          <p style="color: rgba(255,255,255,0.7); margin: 6px 0 0; font-size: 13px;">
            Premium Open Plots · Andhra Pradesh
          </p>
        </div>
        <div style="padding: 32px; background: #fafaf7; border: 1px solid #e8e5dc;">
          <p style="font-size: 16px; color: #1a1a1a;">Dear ${safeName},</p>
          <p style="color: #444; line-height: 1.7;">
            Thank you for your interest in <strong>${safeProject}</strong>.
            Please find your brochure at the link below:
          </p>
          <div style="text-align: center; margin: 28px 0;">
            <a href="${brochureUrl}"
              style="background: #C9A84C; color: #1a0c00; padding: 14px 32px; border-radius: 8px;
                     text-decoration: none; font-weight: 700; font-size: 15px; display: inline-block;">
              Download Brochure
            </a>
          </div>
          <p style="color: #666; font-size: 13px;">
            Our team will reach out to you shortly to assist with your enquiry.
            For immediate assistance, call us at <strong>+91 89772 62683</strong>.
          </p>
        </div>
        <div style="padding: 20px 32px; background: #f0ede4; text-align: center;
                    font-size: 12px; color: #888; border-top: 1px solid #ddd;">
          Chaturbhuja Properties &amp; Infra · Vijayawada, Andhra Pradesh ·
          <a href="https://chaturbhuja.in" style="color: #1E4D2B;">www.chaturbhuja.in</a>
        </div>
      </div>
    `,
  })

  return { success: true, messageId: info.messageId }
}

module.exports = { sendBrochureEmail }
