import puppeteer from 'puppeteer';
import xlsx from 'xlsx';
import fs from 'fs';
import path from 'path';

async function delay(time) {
    return new Promise(function(resolve) { setTimeout(resolve, time) });
}

const categories = [
    { sheetName: "عقارات", query: "مكتب عقارات في الرياض" },
    { sheetName: "صيانة سيارات", query: "مركز صيانة سيارات في الرياض" },
    { sheetName: "مطاعم", query: "مطاعم ومقاهي في الرياض" },
    { sheetName: "محاماة", query: "مكتب محاماة في الرياض" },
    { sheetName: "نوادي رياضية", query: "نادي رياضي في الرياض" },
    { sheetName: "شركات تنظيف", query: "شركة تنظيف منازل في الرياض" },
    { sheetName: "معاهد تدريب", query: "معهد تدريب في الرياض" }
];

async function scrapeGoogleMaps() {
    console.log("Launching browser...");
    const browser = await puppeteer.launch({ 
        headless: false, 
        args: ['--lang=ar'],
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    });
    
    const wb = xlsx.utils.book_new();

    for (let category of categories) {
        console.log(`\n=========================================`);
        console.log(`Starting to scrape category: ${category.sheetName} (${category.query})`);
        console.log(`=========================================\n`);

        const page = await browser.newPage();
        const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(category.query)}/`;
        await page.goto(searchUrl);
        await delay(5000);
        
        let urls = new Set();
        
        console.log(`Scrolling to collect 100 links for ${category.sheetName}...`);
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
                console.log(`[${category.sheetName}] Visiting page ${i + 1}/${urlsArray.length}`);
                await page.goto(urlsArray[i], { waitUntil: 'domcontentloaded' });
                await delay(2000); 
                
                const nameEl = await page.$('h1');
                const name = nameEl ? await page.evaluate(el => el.innerText, nameEl) : category.sheetName;
                
                const phoneEl = await page.$('button[data-item-id^="phone:tel:"]');
                if (phoneEl) {
                    const phoneRaw = await page.evaluate(el => el.getAttribute('data-item-id'), phoneEl);
                    const phone = phoneRaw.replace('phone:tel:', '');
                    
                    leads.push({
                        "اسم المكتب": name,
                        "الرقم": phone,
                        "الوضع ": "",
                        "رابط واتساب": `https://api.whatsapp.com/send?phone=${phone.replace(/\D/g,'')}&text=%D8%A7%D9%84%D8%B3%D9%84%D8%A7%D9%85%20%D8%B9%D9%84%D9%8A%D9%83%D9%85`
                    });
                    console.log(`✅ Extracted: ${name} - ${phone}`);
                } else {
                    console.log(`❌ No phone number found for: ${name}`);
                }
            } catch (e) {
                console.log("Error extracting from URL", e.message);
            }
        }
        
        console.log(`Scraped ${leads.length} complete leads for ${category.sheetName}. Adding to Excel sheet...`);
        const ws = xlsx.utils.json_to_sheet(leads);
        xlsx.utils.book_append_sheet(wb, ws, category.sheetName);

        await page.close(); // Close the page to save memory before moving to next category
    }
    
    const outDir = "C:\\\\Users\\\\iNFO\\\\Desktop\\\\other\\\\freelance";
    if (!fs.existsSync(outDir)){
        fs.mkdirSync(outDir, { recursive: true });
    }
    const outPath = outDir + "\\\\شيت_العملاء_جميع_القطاعات_700_lead.xlsx";
    xlsx.writeFile(wb, outPath);
    
    console.log("Done! Master file saved to: " + outPath);
    await browser.close();
}

scrapeGoogleMaps().catch(console.error);
