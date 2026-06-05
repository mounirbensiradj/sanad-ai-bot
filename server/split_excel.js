import xlsx from 'xlsx';
import path from 'path';

const inputPath = "C:\\\\Users\\\\iNFO\\\\Desktop\\\\other\\\\freelance\\\\شيت_العملاء_جميع_القطاعات_700_lead.xlsx";
const outDir = "C:\\\\Users\\\\iNFO\\\\Desktop\\\\other\\\\freelance";

try {
    console.log("Reading master file...");
    const wb = xlsx.readFile(inputPath);
    
    for (let sheetName of wb.SheetNames) {
        const newWb = xlsx.utils.book_new();
        const ws = wb.Sheets[sheetName];
        xlsx.utils.book_append_sheet(newWb, ws, sheetName);
        
        const safeName = sheetName.replace(/[<>:"/\\|?*]+/g, '_');
        const outPath = path.join(outDir, `${safeName}.xlsx`);
        
        xlsx.writeFile(newWb, outPath);
        console.log(`✅ Saved: ${outPath}`);
    }
    console.log("All sheets have been successfully split into separate files!");
} catch (e) {
    console.error("Error splitting excel file:", e);
}
