import dotenv from 'dotenv';
dotenv.config();

export async function saveLeadToAirtable(leadData) {
    // Using explicit Table ID instead of table name to prevent mismatch errors
    const url = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/tbltMcwgHGz7DNByC`;
    
    const body = {
        records: [
            {
                fields: {
                    Name: leadData.name || "Unknown",
                    Phone: leadData.phone || "Unknown",
                    Industry: leadData.industry || "Not Specified",
                    Bottleneck: leadData.bottleneck || "Not Specified"
                }
            }
        ]
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.AIRTABLE_PAT}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error("Airtable Error:", errText);
            return false;
        }
        
        console.log("Lead successfully saved to Airtable!");
        return true;
    } catch (error) {
        console.error("Failed to save to Airtable:", error);
        return false;
    }
}

// Cache for Calendly link
let calendlyLinkCache = null;

export async function getCalendlyLink() {
    // Return cache immediately if available
    if (calendlyLinkCache) return calendlyLinkCache;
    
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        
        const userRes = await fetch('https://api.calendly.com/users/me', {
            headers: { 'Authorization': `Bearer ${process.env.CALENDLY_PAT}` },
            signal: controller.signal
        });
        clearTimeout(timeout);
        if (!userRes.ok) return getFallbackCalendlyLink();
        const userData = await userRes.json();
        const userUri = userData.resource.uri;

        const controller2 = new AbortController();
        const timeout2 = setTimeout(() => controller2.abort(), 10000);
        
        const eventRes = await fetch(`https://api.calendly.com/event_types?user=${userUri}`, {
            headers: { 'Authorization': `Bearer ${process.env.CALENDLY_PAT}` },
            signal: controller2.signal
        });
        clearTimeout(timeout2);
        if (!eventRes.ok) return getFallbackCalendlyLink();
        const eventData = await eventRes.json();
        
        const activeEvents = eventData.collection.filter(e => e.active);
        if (activeEvents.length > 0) {
            calendlyLinkCache = activeEvents[0].scheduling_url;
            return calendlyLinkCache;
        }
        
        return getFallbackCalendlyLink();
    } catch (error) {
        console.error("Calendly fetch error:", error.message);
        return getFallbackCalendlyLink();
    }
}

function getFallbackCalendlyLink() {
    // Build link from the user UUID in the PAT token
    return 'https://calendly.com/hefiedrihabe41/30min';
}

// Cache for leads (so dashboard always shows something even if Airtable is slow)
let leadsCache = [];

export async function getLeadsFromAirtable() {
    const url = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/tbltMcwgHGz7DNByC`;
    
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout
            
            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_PAT}` },
                signal: controller.signal
            });
            clearTimeout(timeout);
            
            if (!response.ok) {
                console.error("Airtable GET error:", response.status, await response.text());
                return leadsCache; // Return cached data
            }
            const data = await response.json();
            leadsCache = data.records.map(r => ({
                id: r.id,
                name: r.fields.Name || 'Unknown',
                phone: r.fields.Phone || '',
                industry: r.fields.Industry || '',
                bottleneck: r.fields.Bottleneck || '',
                created_at: r.createdTime
            }));
            return leadsCache;
        } catch (error) {
            console.error(`Error fetching leads (attempt ${attempt+1}):`, error.message);
            if (attempt === 1) return leadsCache; // Return cache on final failure
        }
    }
    return leadsCache;
}

export async function getAppointmentsFromCalendly() {
    try {
        // 1. Get user URI
        const userRes = await fetch('https://api.calendly.com/users/me', {
            headers: { 'Authorization': `Bearer ${process.env.CALENDLY_PAT}` }
        });
        if (!userRes.ok) return [];
        const userData = await userRes.json();
        const userUri = userData.resource.uri;

        // 2. Get Scheduled Events
        const eventsRes = await fetch(`https://api.calendly.com/scheduled_events?user=${userUri}&status=active`, {
            headers: { 'Authorization': `Bearer ${process.env.CALENDLY_PAT}` }
        });
        if (!eventsRes.ok) return [];
        const eventsData = await eventsRes.json();
        
        return eventsData.collection.map(e => ({
            id: e.uri,
            name: e.name,
            status: e.status,
            start_time: e.start_time,
            end_time: e.end_time,
            guest_email: e.event_guests?.[0]?.email || 'Unknown',
            guest_name: e.event_memberships?.[0]?.user_name || 'Guest'
        }));
    } catch (error) {
        console.error("Error fetching appointments:", error);
        return [];
    }
}
