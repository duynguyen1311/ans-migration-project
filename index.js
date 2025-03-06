const axios = require('axios');
const qs = require('querystring');
const { getKiotVietAccessToken } = require("./get-access-token");
const { log, logError } = require("./log");
const config = require('./config');
const { getGoogleClient } = require('./get-client');

// Main function to orchestrate the process
async function main() {
    try {
        // Step 1: Get access token
        const accessToken = await getKiotVietAccessToken();
        log('✓ Access token obtained');

        // Step 2: Fetch invoices
        const invoices = await fetchInvoices(accessToken);
        log(`✓ Retrieved ${invoices.length} invoices`);

        // Step 3: Add to Google Sheet
        await addToGoogleSheet(invoices);
        log('✓ Process completed successfully');

        return true;
    } catch (error) {
        logError(`Error in main process: ${error.message}`);
        return false;
    }
}

// Function to fetch invoices from the API
async function fetchInvoices(accessToken) {
    try {
        // Get current date in YYYY-MM-DD format using LOCAL timezone, not UTC
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const formattedDate = `${year}-${month}-${day}`;

        log(`Fetching invoices for date: ${formattedDate}`);
        const response = await axios.get('https://public.kiotapi.com/invoices', {
            headers: {
                'Retailer': config.retailer,
                'Authorization': `Bearer ${accessToken}`
            },
            params: {
                pageSize: 200,
                status: '[1,3]',
                fromPurchaseDate: formattedDate,
                toPurchaseDate: formattedDate,
                orderBy: 'purchaseDate',
                orderDirection: 'Desc'
            }
        });

        const rawInvoices = response.data.data;

        // Process each invoice to extract structured data
        return rawInvoices.map(invoice => {
            const parsedDescription = parseDescription(invoice.description || '');

            return {
                code: invoice.code || '',
                purchaseDate: invoice.purchaseDate || '',
                items: parsedDescription.items || [],
                paymentStatus: parsedDescription.paymentStatus || '',
                returnDate: parsedDescription.returnDate || ''
            };
        });
    } catch (error) {
        logError('Error fetching invoices:', error.message);
        throw error;
    }
}

// Function to parse the invoice description
function parseDescription(description) {
    if (!description) {
        return { items: [], paymentStatus: '', returnDate: '' };
    }

    // Split by new lines
    const lines = description.split('\n').filter(line => line.trim() !== '');

    // Initialize result
    const result = {
        items: [],
        paymentStatus: '',
        returnDate: ''
    };

    // Process each line
    lines.forEach(line => {
        // Check if it's a numbered item (starts with number followed by period)
        if (/^\d+\./.test(line.trim())) {
            // It's a numbered item, extract product and work
            const parts = line.split('+').map(part => part.trim());

            // Remove the leading number and period from the product name
            const productName = parts[0].replace(/^\d+\.\s*/, '').trim();

            // The work part is after the +
            const work = parts.length > 1 ? parts[1] : '';

            result.items.push({
                productName,
                work
            });
        }
        // Check if it's the payment status
        else if (line.trim() === 'ĐTT') {
            result.paymentStatus = 'Đã thanh toán';
        } else if (line.trim() === 'CTT') {
            result.paymentStatus = 'Chưa thanh toán'
        }
        // Check if it's the return date
        else if (line.trim().startsWith('Hẹn trả:')) {
            // Extract just the date part
            result.returnDate = line.replace('Hẹn trả:', '').trim();
        }
    });

    return result;
}

function formatDate(isoDateString) {
    // Create a Date object from the ISO string
    const date = new Date(isoDateString);

    // Extract date components
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();

    // Extract time components
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    // Combine into desired format for Google Sheets: MM/dd/yyyy HH:mm
    // This format is what Google Sheets expects for proper date recognition
    return `${month}/${day}/${year} ${hours}:${minutes}`;
}

// Function to add invoices to Google Sheet
async function addToGoogleSheet(invoices) {
    try {
        // Set up authentication using the dedicated module
        const { sheets } = await getGoogleClient();

        // Verify spreadsheet exists and is accessible
        try {
            await sheets.spreadsheets.get({
                spreadsheetId: config.spreadsheet.id
            });
            log(`Connected to spreadsheet: ${config.spreadsheet.id}`);
        } catch (error) {
            throw new Error(`Cannot access spreadsheet. Error: ${error.message}`);
        }

        // Check if sheet exists
        const spreadsheet = await sheets.spreadsheets.get({
            spreadsheetId: config.spreadsheet.id,
            includeGridData: false
        });

        const sheetExists = spreadsheet.data.sheets.some(
            sheet => sheet.properties.title === config.spreadsheet.sheetName
        );

        let sheetId = null;

        if (!sheetExists) {
            // Create the sheet if it doesn't exist
            const response = await sheets.spreadsheets.batchUpdate({
                spreadsheetId: config.spreadsheet.id,
                requestBody: {
                    requests: [
                        {
                            addSheet: {
                                properties: {
                                    title: config.spreadsheet.sheetName
                                }
                            }
                        }
                    ]
                }
            });

            // Get the sheet ID from the response
            sheetId = response.data.replies[0].addSheet.properties.sheetId;

            // Add headers
            await sheets.spreadsheets.values.update({
                spreadsheetId: config.spreadsheet.id,
                range: `${config.spreadsheet.sheetName}!A1:J1`,
                valueInputOption: 'RAW',
                requestBody: {
                    values: [config.spreadsheet.headers]
                }
            });

            log(`Created sheet "${config.spreadsheet.sheetName}" with headers`);
        } else {
            // Get the sheet ID if it already exists
            sheetId = spreadsheet.data.sheets.find(
                sheet => sheet.properties.title === config.spreadsheet.sheetName
            ).properties.sheetId;
        }

        // Get existing invoice codes to avoid duplicates
        const existingData = await sheets.spreadsheets.values.get({
            spreadsheetId: config.spreadsheet.id,
            range: `${config.spreadsheet.sheetName}!A:A`
        });

        // Extract existing invoice codes
        const existingCodes = new Set();
        if (existingData.data.values && existingData.data.values.length > 1) {
            existingData.data.values.slice(1).forEach(row => {
                if (row[0]) existingCodes.add(row[0]);
            });
        }

        log(`Found ${existingCodes.size} existing invoice codes`);

        // Filter out already added invoices
        const newInvoices = invoices.filter(invoice => !existingCodes.has(invoice.code));

        if (newInvoices.length === 0) {
            log('No new invoices to add');
            return;
        }

        log(`Adding ${newInvoices.length} new invoices`);

        // Prepare rows - one row per product
        const rows = [];

        newInvoices.forEach(invoice => {
            // Format created date with our custom formatter
            const purchaseDate = formatDate(invoice.purchaseDate);
            const returnDateAsText = invoice.returnDate ? `'${invoice.returnDate}` : '';
            // If there are items, create a row for each item
            if (invoice.items && invoice.items.length > 0) {
                invoice.items.forEach(item => {
                    rows.push([
                        invoice.code,           // Hoá đơn
                        purchaseDate,            // Ngày nhận
                        returnDateAsText,       // Ngày trả
                        item.productName,       // Tên đồ dùng
                        item.work,              // Công việc
                        config.statusValues[0],       // Trạng thái (will be set via dropdown)
                        '',                     // Thời gian (empty)
                        config.peopleValues[0],       // Người làm (empty for dropdown selection)
                        invoice.paymentStatus,  // Trạng thái thanh toán
                        ''                      // Ghi chú (empty)
                    ]);
                });
            } else {
                // No items - create a single row with empty product and work
                rows.push([
                    invoice.code,           // Hoá đơn
                    purchaseDate,            // Ngày nhận
                    returnDateAsText,       // Ngày trả
                    '',                     // Tên đồ dùng (empty)
                    '',                     // Công việc (empty)
                    config.statusValues[0],       // Trạng thái (will be set via dropdown)
                    '',                     // Thời gian (empty)
                    config.peopleValues[0],       // Người làm (empty for dropdown selection)
                    invoice.paymentStatus,  // Trạng thái thanh toán
                    ''                      // Ghi chú (empty)
                ]);
            }
        });

        // Add data to sheet
        if (rows.length > 0) {
            // Calculate row count for new rows
            const numRows = rows.length;

            // STEP 1: Insert empty rows right after the header (row index 1)
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId: config.spreadsheet.id,
                requestBody: {
                    requests: [
                        {
                            insertDimension: {
                                range: {
                                    sheetId: sheetId,
                                    dimension: "ROWS",
                                    startIndex: 1,  // After header (0-indexed)
                                    endIndex: 1 + numRows
                                },
                                inheritFromBefore: false
                            }
                        }
                    ]
                }
            });

            // STEP 2: Fill the newly inserted rows with data
            await sheets.spreadsheets.values.update({
                spreadsheetId: config.spreadsheet.id,
                range: `${config.spreadsheet.sheetName}!A2:J${1 + numRows}`, // Start at row 2 (after header)
                valueInputOption: 'USER_ENTERED', // Handle dates properly
                requestBody: {
                    values: rows
                }
            });

            // The start and end rows for formatting (2-indexed for display, 1-indexed for API)
            const startRow = 2;  // First row after header
            const endRow = startRow + numRows - 1;

            // Apply normal formatting and set number formats for date columns
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId: config.spreadsheet.id,
                requestBody: {
                    requests: [
                        {
                            // First, completely clear all formatting for the new rows
                            updateCells: {
                                range: {
                                    sheetId: sheetId,
                                    startRowIndex: startRow - 1,  // 0-indexed
                                    endRowIndex: endRow,
                                    startColumnIndex: 0,
                                    endColumnIndex: 10
                                },
                                fields: "userEnteredFormat",
                                rows: Array(endRow - startRow + 1).fill({
                                    values: Array(10).fill({
                                        userEnteredFormat: {}  // Empty format = clear formatting
                                    })
                                })
                            }
                        },
                        {
                            // Then, explicitly set to plain text style for all cells
                            repeatCell: {
                                range: {
                                    sheetId: sheetId,
                                    startRowIndex: startRow - 1,  // 0-indexed
                                    endRowIndex: endRow,
                                    startColumnIndex: 0,
                                    endColumnIndex: 10
                                },
                                cell: {
                                    userEnteredFormat: {
                                        textFormat: {
                                            bold: false,
                                            italic: false,
                                            fontSize: 10,  // Normal font size
                                            fontFamily: "Arial"
                                        },
                                        backgroundColor: {
                                            red: 1,
                                            green: 1,
                                            blue: 1
                                        },
                                        horizontalAlignment: "LEFT",
                                        verticalAlignment: "MIDDLE",
                                        wrapStrategy: "WRAP"
                                    }
                                },
                                fields: "userEnteredFormat"
                            }
                        },
                        {
                            // Set "Ngày nhận" column (B - index 1) to date format
                            repeatCell: {
                                range: {
                                    sheetId: sheetId,
                                    startRowIndex: startRow - 1,
                                    endRowIndex: endRow,
                                    startColumnIndex: 1,
                                    endColumnIndex: 2
                                },
                                cell: {
                                    userEnteredFormat: {
                                        numberFormat: {
                                            type: "DATE_TIME",
                                            pattern: "dd/MM/yyyy HH:mm"
                                        }
                                    }
                                },
                                fields: "userEnteredFormat.numberFormat"
                            }
                        },
                        {
                            // CRITICAL: Set "Ngày trả" column (C - index 2) as RAW TEXT
                            repeatCell: {
                                range: {
                                    sheetId: sheetId,
                                    startRowIndex: startRow - 1,
                                    endRowIndex: endRow,
                                    startColumnIndex: 2,
                                    endColumnIndex: 3
                                },
                                cell: {
                                    userEnteredFormat: {
                                        numberFormat: {
                                            type: "TEXT"  // Force TEXT format to prevent date conversion
                                        }
                                    }
                                },
                                fields: "userEnteredFormat.numberFormat"
                            }
                        },
                        {
                            // Style "Trạng thái" column (F - index 5) to look like a dropdown
                            repeatCell: {
                                range: {
                                    sheetId: sheetId,
                                    startRowIndex: startRow - 1,
                                    endRowIndex: endRow,
                                    startColumnIndex: 5,
                                    endColumnIndex: 6
                                },
                                cell: {
                                    userEnteredFormat: {
                                        // Add subtle formatting to indicate it's a dropdown
                                        backgroundColor: {
                                            red: 0.95,
                                            green: 0.95,
                                            blue: 0.95
                                        },
                                    }
                                },
                                fields: "userEnteredFormat.backgroundColor"
                            }
                        },
                        {
                            // Style "Người làm" column (H - index 7) to look like a dropdown
                            repeatCell: {
                                range: {
                                    sheetId: sheetId,
                                    startRowIndex: startRow - 1,
                                    endRowIndex: endRow,
                                    startColumnIndex: 7,
                                    endColumnIndex: 8
                                },
                                cell: {
                                    userEnteredFormat: {
                                        // Add subtle formatting to indicate it's a dropdown
                                        backgroundColor: {
                                            red: 0.95,
                                            green: 0.95,
                                            blue: 0.95
                                        },
                                        horizontalAlignment: "LEFT"
                                    }
                                },
                                fields: "userEnteredFormat.backgroundColor,userEnteredFormat.horizontalAlignment"
                            }
                        }
                    ]
                }
            });

            log(`Applied formatting to rows ${startRow}-${endRow}`);

            // Set up dropdowns for Status (column F) and People (column H)
            await setupDropdowns(sheets, config.spreadsheet.id, sheetId);
            log(`Applied dropdown to all rows`);
        }
    } catch (error) {
        logError('Error adding to Google Sheet:', error.message);
        throw error;
    }
}

// Setup dropdowns for status and people columns
async function setupDropdowns(sheets, spreadsheetId, sheetId) {
    try {
        // Create dropdown request for Status column (F - index 5)
        const statusDropdownRequest = {
            setDataValidation: {
                range: {
                    sheetId: sheetId,
                    startRowIndex: 1,  // Start from row after header
                    endRowIndex: 1000, // Set a reasonable limit
                    startColumnIndex: 5, // Column F (0-indexed)
                    endColumnIndex: 6
                },
                rule: {
                    condition: {
                        type: "ONE_OF_LIST",
                        values: config.statusValues.map(value => ({ userEnteredValue: value }))
                    },
                    strict: true,
                    showCustomUi: true,
                    inputMessage: "Chọn trạng thái công việc"
                }
            }
        };

        // Create dropdown request for People column (H - index 7)
        const peopleDropdownRequest = {
            setDataValidation: {
                range: {
                    sheetId: sheetId,
                    startRowIndex: 1,  // Start from row after header
                    endRowIndex: 1000, // Set a reasonable limit
                    startColumnIndex: 7, // Column H (0-indexed)
                    endColumnIndex: 8
                },
                rule: {
                    condition: {
                        type: "ONE_OF_LIST",
                        values: config.peopleValues.map(value => ({ userEnteredValue: value }))
                    },
                    strict: true,
                    showCustomUi: true,
                    inputMessage: "Chọn người thực hiện"
                }
            }
        };

        // Create color formatting requests for each status value
        const colorRequests = Object.entries(config.statusColors).map(([status, [r, g, b]]) => {
            return {
                addConditionalFormatRule: {
                    rule: {
                        ranges: [{
                            sheetId: sheetId,
                            startRowIndex: 1,
                            endRowIndex: 1000,
                            startColumnIndex: 5,
                            endColumnIndex: 6
                        }],
                        booleanRule: {
                            condition: {
                                type: "TEXT_EQ",
                                values: [{ userEnteredValue: status }]
                            },
                            format: {
                                backgroundColor: {
                                    red: r / 255,
                                    green: g / 255,
                                    blue: b / 255
                                },
                                textFormat: {
                                    foregroundColor: {
                                        red: (r < 128 && g < 128 && b < 128) ? 1 : 0,
                                        green: (r < 128 && g < 128 && b < 128) ? 1 : 0,
                                        blue: (r < 128 && g < 128 && b < 128) ? 1 : 0
                                    }
                                }
                            }
                        }
                    },
                    index: 0
                }
            };
        });

        // Create color formatting requests for each person
        const peopleColorRequests = Object.entries(config.peopleColors).map(([person, [r, g, b]]) => {
            return {
                addConditionalFormatRule: {
                    rule: {
                        ranges: [{
                            sheetId: sheetId,
                            startRowIndex: 1,
                            endRowIndex: 1000,
                            startColumnIndex: 7,
                            endColumnIndex: 8
                        }],
                        booleanRule: {
                            condition: {
                                type: "TEXT_EQ",
                                values: [{ userEnteredValue: person }]
                            },
                            format: {
                                backgroundColor: {
                                    red: r / 255,
                                    green: g / 255,
                                    blue: b / 255
                                },
                                textFormat: {
                                    foregroundColor: {
                                        red: (r < 128 && g < 128 && b < 128) ? 1 : 0,
                                        green: (r < 128 && g < 128 && b < 128) ? 1 : 0,
                                        blue: (r < 128 && g < 128 && b < 128) ? 1 : 0
                                    }
                                }
                            }
                        }
                    },
                    index: 0
                }
            };
        });

        // Apply all rules (dropdowns and colors)
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: spreadsheetId,
            requestBody: {
                requests: [
                    statusDropdownRequest,
                    peopleDropdownRequest,
                    ...colorRequests,
                    ...peopleColorRequests
                ]
            }
        });

        // Set default values for empty cells in the status and people columns
        // First, get all existing data
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: spreadsheetId,
            range: `${config.spreadsheet.sheetName}!A:J`
        });

        if (response.data.values && response.data.values.length > 1) {
            const rows = response.data.values;
            const defaultStatusUpdates = [];
            const defaultPeopleUpdates = [];

            // Start from row 2 (index 1) to skip the header
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                // Check if the row has any content (at least column A has data)
                if (row && row[0]) {
                    // Check if Status column (F, index 5) is empty and should have a default
                    if (!row[5] || row[5] === '') {
                        defaultStatusUpdates.push({
                            range: `${config.spreadsheet.sheetName}!F${i + 1}`,
                            values: [[config.statusValues[0]]]
                        });
                    }

                    // Check if People column (H, index 7) is empty and should have a default
                    if (!row[7] || row[7] === '') {
                        defaultPeopleUpdates.push({
                            range: `${config.spreadsheet.sheetName}!H${i + 1}`,
                            values: [[config.peopleValues[0]]]
                        });
                    }
                }
            }

            // Apply the default values if we have any updates
            if (defaultStatusUpdates.length > 0) {
                await sheets.spreadsheets.values.batchUpdate({
                    spreadsheetId: spreadsheetId,
                    requestBody: {
                        valueInputOption: 'USER_ENTERED',
                        data: defaultStatusUpdates
                    }
                });
            }

            if (defaultPeopleUpdates.length > 0) {
                await sheets.spreadsheets.values.batchUpdate({
                    spreadsheetId: spreadsheetId,
                    requestBody: {
                        valueInputOption: 'USER_ENTERED',
                        data: defaultPeopleUpdates
                    }
                });
            }
        }

        log("✓ Dropdowns and conditional formatting set up successfully");
    } catch (error) {
        logError("Error setting up dropdowns:", error.message);
    }
}

// Execute if run directly
if (require.main === module) {
    main();
} else {
    module.exports = { main };
}