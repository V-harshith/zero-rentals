
const XLSX = require('xlsx');
const fs = require('fs');

const filePath = 'c:\\Users\\hxrshith-pc\\All_projects\\zerorentals\\zero-rentals\\zero rental test.xlsx';

try {
    if (!fs.existsSync(filePath)) {
        console.log('File not found:', filePath);
        process.exit(1);
    }

    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet);

    console.log(`Successfully read Excel file. Sheet: ${sheetName}`);
    console.log(`Total rows: ${data.length}`);

    let emailCount = 0;
    const emails = [];

    // Helper to check for email format
    const isEmail = (str) => {
        return typeof str === 'string' && str.includes('@') && str.includes('.');
    };

    data.forEach((row, index) => {
        Object.values(row).forEach(value => {
            if (isEmail(value)) {
                emailCount++;
                if (emails.length < 5) {
                    emails.push(value);
                }
            }
        });
    });

    if (emailCount > 0) {
        console.log(`Found ${emailCount} potential email addresses.`);
        console.log('First 5 emails found:');
        emails.forEach(email => console.log(`- ${email}`));
        
        // Also print column headers to see if there's an "Email" column
        if (data.length > 0) {
            console.log('\nColumn Headers:', Object.keys(data[0]).join(', '));
        }
    } else {
        console.log('No email addresses found in the regular pattern check.');
        // Print first row to show what data looks like
        if (data.length > 0) {
            console.log('\nFirst row sample:', JSON.stringify(data[0], null, 2));
        }
    }

} catch (error) {
    console.error('Error reading Excel file:', error);
}
