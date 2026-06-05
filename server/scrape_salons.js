import puppeteer from 'puppeteer';
import xlsx from 'xlsx';

async function delay(time) {
    return new Promise(function(resolve) { setTimeout(resolve, time) });
}

async function scrapeGoogleMaps() {
    console.log("Launching browser...");
    const browser = await puppeteer.launch({ 
        headless: false, 
        args: ['--lang=ar'],
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    });
    
    const page = await browser.newPage();
    console.log("Going to Google Maps...");
    await page.goto('https://www.google.com/maps/search/صالونات+التجميل+النسائية+في+الرياض/');
    await delay(5000);
    
    let urls = new Set();
    
    console.log("Scrolling to collect 100 salon links...");
    for (let i = 0; i < 40; i++) {
        const items = await page.$$('a[href*="/maps/place/"]');
        for (let item of items) {
            const url = await page.evaluate(el => el.href, item);
            urls.add(url);
        }
        
        console.log(`Found ${urls.size} unique URLs so far...`);
        if (urls.size >= 100) break;
        
        const feed = await page.$('div[role="feed"]');
        if (feed) {
            await page.evaluate(el => el.scrollBy(0, 1000), feed);
            await delay(2000);
        } else {
            break;
        }
    }
    
    console.log(`Finished collecting ${urls.size} URLs. Now extracting phone numbers...`);
    let leads = [];
    let urlsArray = Array.from(urls).slice(0, 100);
    
    for (let i = 0; i < urlsArray.length; i++) {
        try {
            console.log(`Visiting salon ${i + 1}/${urlsArray.length}`);
            await page.goto(urlsArray[i], { waitUntil: 'domcontentloaded' });
            await delay(2000); // Wait for phone number to render
            
            // The title is in the h1 element
            const nameEl = await page.$('h1');
            const name = nameEl ? await page.evaluate(el => el.innerText, nameEl) : "صالون تجميل";
            
            // The phone number button has data-item-id starting with phone:tel:
            const phoneEl = await page.$('button[data-item-id^="phone:tel:"]');
            if (phoneEl) {
                const phoneRaw = await page.evaluate(el => el.getAttribute('data-item-id'), phoneEl);
                const phone = phoneRaw.replace('phone:tel:', '');
                
                leads.push({
                    "اسم المكتب": name,
                    "الرقم": phone,
                    "الوضع ": "",
                    "رابط واتساب": `https://api.whatsapp.com/send?phone=${phone.replace(/\\D/g,'')}&text=%D8%A7%D9%84%D8%B3%D9%84%D8%A7%D9%85%20%D8%B9%D9%84%D9%8A%D9%83%D9%85`
                });
                console.log(`✅ Extracted: ${name} - ${phone}`);
            } else {
                console.log(`❌ No phone number found for: ${name}`);
            }
        } catch (e) {
            console.log("Error extracting from URL", e.message);
        }
    }
    
    console.log(`Scraped ${leads.length} complete leads with phone numbers. Saving to Excel...`);
    
    const ws = xlsx.utils.json_to_sheet(leads);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Leads");
    xlsx.writeFile(wb, "C:\\\\Users\\\\iNFO\\\\Desktop\\\\other\\\\freelance\\\\عقار\\\\+عملاء محتملين\\\\صالونات_تجميل_الرياض_100_lead.xlsx");
    
    console.log("Done!");
    await browser.close();
}

scrapeGoogleMaps().catch(console.error);
