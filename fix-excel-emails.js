const XLSX = require('xlsx');
const fs = require('fs');

// Read Excel file
const excelPath = './ZeroRentals_Harshith_Import_Template.xlsx';
if (!fs.existsSync(excelPath)) {
  console.log('Excel file not found at:', excelPath);
  process.exit(1);
}

const workbook = XLSX.readFile(excelPath);
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(worksheet);

console.log('Processing', data.length, 'rows...');

// Fix emails - replace phone number emails with proper format
const fixedData = data.map((row, index) => {
  const email = String(row['Email'] || '').trim();
  const ownerName = String(row['Owner Name'] || '').trim();
  const propertyName = String(row['Property Name'] || '').trim();

  // Check if email is a phone number format (digits only or digits@gmail.com)
  const isPhoneEmail = /^\d+@gmail\.com$/.test(email) || /^\d+$/.test(email);

  if (isPhoneEmail || !email.includes('@')) {
    // Create a proper email from owner name
    const cleanName = ownerName.toLowerCase().replace(/[^a-z0-9]/g, '.').replace(/\.+/g, '.').replace(/^\.|\.$/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    row['Email'] = `${cleanName}.${randomSuffix}@zerorentals.in`;
    console.log(`Row ${index + 2}: Fixed email from "${email}" to "${row['Email']}"`);
  }

  return row;
});

// Create new worksheet
const newWorksheet = XLSX.utils.json_to_sheet(fixedData);
workbook.Sheets[sheetName] = newWorksheet;

// Save fixed Excel
const outputPath = './ZeroRentals_Harshith_Import_Template_Fixed.xlsx';
XLSX.writeFile(workbook, outputPath);

console.log('\n✅ Fixed Excel saved to:', outputPath);
console.log('\nSample of fixed emails:');
fixedData.slice(0, 5).forEach((row, i) => {
  console.log(`  ${row['Owner Name']}: ${row['Email']}`);
});
