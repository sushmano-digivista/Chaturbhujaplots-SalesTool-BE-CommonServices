/**
 * whatsapp.service.js
 * Sends brochure link via WhatsApp Business Cloud API (Meta).
 * Falls back to wa.me deep-link URL generation if API not configured.
 */
const axios = require('axios')

const BROCHURE_URLS = {
  anjana:  'https://chaturbhuja.in/brochures/Anjana_Paradise_Brochure.pdf',
  aparna:  'https://chaturbhuja.in/brochures/Aparna_Legacy_Brochure.pdf',
  varaha:  'https://chaturbhuja.in/brochures/Varaha_Virtue_Brochure.pdf',
  trimbak: 'https://chaturbhuja.in/brochures/Trimbak_Oaks_Brochure.pdf',
  general: 'https://chaturbhuja.in/brochures/Chaturbhuja_Overview_Brochure.pdf',
}

/**
 * sendBrochureWhatsApp({ phone, name, projectId, projectName })
 * Uses WhatsApp Cloud API if WA_TOKEN + WA_PHONE_ID are set in .env.
 * Otherwise returns a wa.me deep-link for manual sending.
 */
async function sendBrochureWhatsApp({ phone, name, projectId, projectName }) {
  const brochureUrl = BROCHURE_URLS[projectId] || BROCHURE_URLS.general
  const project     = projectName || 'Chaturbhuja Properties'
  const cleanPhone  = phone.replace(/[^0-9]/g, '').replace(/^0/, '91')
  const displayPhone = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone}`

  // ── WhatsApp Cloud API (if configured) ──────────────────────────────────
  const waToken   = process.env.WA_TOKEN
  const waPhoneId = process.env.WA_PHONE_ID

  if (waToken && waPhoneId) {
    const message = `Hello ${name || 'there'}! 👋\n\nThank you for your interest in *${project}*.\n\nHere is your brochure:\n${brochureUrl}\n\nOur team will contact you shortly. For immediate assistance:\n📞 +91 89772 62683\n🌐 www.chaturbhuja.in\n\n_Chaturbhuja Properties & Infra — Premium Plots · Andhra Pradesh_`

    const response = await axios.post(
      `https://graph.facebook.com/v19.0/${waPhoneId}/messages`,
      {
        messaging_product: 'whatsapp',
        to:                displayPhone,
        type:              'text',
        text:              { body: message },
      },
      {
        headers: {
          Authorization:  `Bearer ${waToken}`,
          'Content-Type': 'application/json',
        },
      }
    )
    return { success: true, method: 'cloud_api', messageId: response.data?.messages?.[0]?.id }
  }

  // ── Fallback: return wa.me deep-link ─────────────────────────────────────
  const text = `Hi! I am interested in ${project}. Please send me the brochure and details.`
  const deepLink = `https://wa.me/${displayPhone}?text=${encodeURIComponent(text)}`

  return { success: true, method: 'deeplink', deepLink }
}

module.exports = { sendBrochureWhatsApp }
