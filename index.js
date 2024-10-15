/* exported gapiLoaded */
/* exported gisLoaded */
/* exported handleAuthClick */
/* exported handleSignoutClick */

// TODO(developer): Set to client ID and API key from the Developer Console
const CLIENT_ID = '284726603175-p6h09rdkvra6jjnln92dol5obgo6jghf.apps.googleusercontent.com';
const API_KEY = 'AIzaSyDOk-EDPaXadMC2KkoVrtCr_pdkGSqKLGs';

// Discovery doc URL for APIs used by the quickstart
const DISCOVERY_DOC = 'https://sheets.googleapis.com/$discovery/rest?version=v4';

// Authorization scopes required by the API; multiple scopes can be
// included, separated by spaces.
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';

let tokenClient;
let gapiInited = false;
let gisInited = false;
let loggedIn = false;
let sheetId = undefined;
let sheetNames = undefined;
let sheetName = undefined;
let headers = [];
rows = [];
let lastCol = undefined;
let editRowNum = undefined;

if (window.location.search) {
    const params = new URLSearchParams(window.location.search);
    if (params.has('sheetId'))
        sheetId = params.get('sheetId');
    else
        // prompt user to enter sheetId
        sheetId = prompt('Enter sheetId');
    if (params.has('sheetName'))
        sheetName = params.get('sheetName');
}

document.getElementById('authorize_button').style.visibility = 'hidden';
document.getElementById('signout_button').style.visibility = 'hidden';

$(document).ready(function () {
    gapi.load('client', initializeGapiClient);
    gisLoaded();
});

/**
 * Callback after api.js is loaded.
 */
function gapiLoaded() {
    gapi.load('client', initializeGapiClient);
}

/**
 * Callback after the API client is loaded. Loads the
 * discovery doc to initialize the API.
 */
async function initializeGapiClient() {
    await gapi.client.init({
        apiKey: API_KEY,
        discoveryDocs: [DISCOVERY_DOC],
    });
    gapiInited = true;
    maybeEnableButtons();
}

/**
 * Callback after Google Identity Services are loaded.
 */
function gisLoaded() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: '', // defined later
    });
    gisInited = true;
    maybeEnableButtons();
}

/**
 * Enables user interaction after all libraries are loaded.
 */
function maybeEnableButtons() {
    if (gapiInited && gisInited) {
        document.getElementById('authorize_button').style.visibility = 'visible';
    }
}

/**
 *  Sign in the user upon button click.
 */
function handleAuthClick() {
    tokenClient.callback = async (resp) => {
        if (resp.error !== undefined) {
            throw (resp);
        }
        localStorage.setItem('access_token', resp.access_token);
        document.getElementById('signout_button').style.visibility = 'visible';
        document.getElementById('authorize_button').innerText = 'Refresh';
        await fetchRows();
    };

    if (localStorage.getItem('access_token') && gapi.client.getToken() === null) {
        gapi.client.setToken({ access_token: localStorage.getItem('access_token') });
    }
    if (localStorage.getItem('access_token') && gapi.client.getToken() !== null) {
        tokenClient.requestAccessToken({ prompt: '' });
    } else {
        tokenClient.requestAccessToken({ prompt: 'consent' });
    }

    // if (gapi.client.getToken() === null) {
    //     // Prompt the user to select a Google Account and ask for consent to share their data
    //     // when establishing a new session.
    //     tokenClient.requestAccessToken({ prompt: 'consent' });
    // } else {
    //     // Skip display of account chooser and consent dialog for an existing session.
    //     tokenClient.requestAccessToken({ prompt: '' });
    // }
}

/**
 *  Sign out the user upon button click.
 */
function handleSignoutClick() {
    const token = gapi.client.getToken();
    if (token !== null) {
        google.accounts.oauth2.revoke(token.access_token);
        gapi.client.setToken('');
        document.getElementById('content').innerText = '';
        document.getElementById('authorize_button').innerText = 'Log in';
        document.getElementById('signout_button').style.visibility = 'hidden';
    }
    $('.my-container').removeClass('cards-state');
    $('.my-container').removeClass('edit-state');
}

/** 
 * Function to update URL parameters without reloading
*/
function updateURLParameter(param, value) {
    const url = new URL(window.location);
    url.searchParams.set(param, value);
    window.history.pushState({}, '', url);
}

function selectSheet(name) {
    sheetName = name;
    updateURLParameter('sheetName', sheetName);
    // add class 'active' to the selected sheet
    $('.sheet-list li').removeClass('active');
    $(`.sheet-list li:contains(${name})`).addClass('active');
    // aria-current="true"
    $('.sheet-list li').attr('aria-current', 'false');
    $(`.sheet-list li:contains(${name})`).attr('aria-current', 'true');
}

/**
 * fetch list of sheet names
 */
async function fetchSheetNames() {
    let response;
    try {
        response = await gapi.client.sheets.spreadsheets.get({
            spreadsheetId: sheetId,
            fields: 'properties.title,sheets.properties.title'
        });
    } catch (err) {
        document.getElementById('content').innerText = err.message;
        return;
    }
    sheetNames = response.result.sheets.map(sheet => sheet.properties.title);
    $('#file-name').text(response.result.properties.title);
    if (!sheetNames || sheetNames.length == 0) {
        document.getElementById('content').innerText = 'No sheets found.';
        return;
    }
    // clear the .sheet-list
    $('.sheet-list').empty();
    // add to the .sheet-list using jquery
    sheetNames.forEach(name => {
        if (name === sheetName)
            $('.sheet-list').append(`<li class="list-group-item list-group-item-action active" aria-current="true">${name}</li>`);
        else
            $('.sheet-list').append(`<li class="list-group-item list-group-item-action">${name}</li>`);
    });
    // add click event to each sheet
    $('.sheet-list li').click(async function () {
        selectSheet(this.innerText);
        await fetchRows();
    });
}


/**
 * returns list of headers of specific sheet
 */
async function fetchSheetHeaders() {
    let response;
    // now check width of the columns
    try {
        response = await gapi.client.sheets.spreadsheets.get({
            spreadsheetId: sheetId,
            ranges: `'${sheetName}'!1:1`,
            // includeGridData: true,
            fields: 'sheets.data.rowData.values.formattedValue,sheets.data.columnMetadata.hiddenByUser'
        });
    } catch (err) {
        document.getElementById('content').innerText = err.message;
        return;
    }
    headers = response.result.sheets[0].data[0].rowData[0].values.map(cell => cell.formattedValue);
    headers = headers.map((header, i) => {
        return {
            name: header,
            hidden: response.result.sheets[0].data[0].columnMetadata[i].hiddenByUser === true
        };
    });

    // try {
    //     response = await gapi.client.sheets.spreadsheets.values.get({
    //         spreadsheetId: sheetId,
    //         range: `'${sheetName}'!1:1`,
    //     });
    // } catch (err) {
    //     document.getElementById('content').innerText = err.message;
    //     return;
    // }
    // const range = response.result;
    // if (!range || !range.values || range.values.length == 0) {
    //     document.getElementById('content').innerText = 'No values found.';
    //     return;
    // }
    // headersNames = range.values[0];
    // set lastCol to the last column index letter (A, B, C, ...)
    lastCol = String.fromCharCode(65 + headers.length - 1);
}

/**
 * Print the names and majors of students in a sample spreadsheet:
 * https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit
 */
async function fetchRows() {
    if (sheetId === undefined) {
        sheetId = prompt('Enter sheetId');
        updateURLParameter('sheetId', sheetId);
    }
    if (!sheetNames) {
        await fetchSheetNames();
    }
    if (sheetName === undefined || sheetNames.indexOf(sheetName) === -1) {
        selectSheet(sheetNames[0]);
    }
    await fetchSheetHeaders();
    let response;
    try {
        response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: sheetId,
            range: `'${sheetName}'!A2:${lastCol}`
        });
    } catch (err) {
        document.getElementById('content').innerText = err.message;
        return;
    }
    const range = response.result;
    if (!range || !range.values || range.values.length == 0) {
        document.getElementById('content').innerText = 'No values found.';
        return;
    }
    // check the number of rows before empty row
    let rowsNumber = 0;
    while (rowsNumber < range.values.length && range.values[rowsNumber].length > 0) {
        rowsNumber++;
    }
    // now get the colors of the first column
    try {
        response = await gapi.client.sheets.spreadsheets.get({
            spreadsheetId: sheetId,
            ranges: `'${sheetName}'!A2:${lastCol}${rowsNumber + 1}`,
            fields: 'sheets.data.rowData.values.effectiveFormat.backgroundColor,sheets.data.rowData.values.hyperlink,sheets.data.rowData.values.formattedValue'
        });
    } catch (err) {
        document.getElementById('content').innerText = err.message;
        return;
    }
    const colors = response.result.sheets[0].data[0].rowData
        .map(row => row.values[0].effectiveFormat.backgroundColor)
        .map(color => {
            return {
                r: color.red === undefined ? 0 : color.red * 255,
                g: color.green === undefined ? 0 : color.green * 255,
                b: color.blue === undefined ? 0 : color.blue * 255
            };
        });

    // add cards to .card-list using jquery
    $('.card-list').empty();
    rows = range.values;
    for (let i = 0; i < rowsNumber; i++) {
        if (rows[i].length === 0) {
            break;
        }
        let cardContainer = $(`<li class="card-container" id="card_${i}"></li>`);
        let card = $(`<div class="card" style="background-color: rgb(${colors[i].r}, ${colors[i].g}, ${colors[i].b})">
                      </div>`);
        headers.forEach((header, j) => {
            if (header.hidden) return;
            card.append(
                `<div>
                    <span>${header.name}</span><br>
                    <span>${rows[i].length > j
                    ? (response.result.sheets[0].data[0].rowData[i].values[j].hyperlink !== undefined
                        ? `<a href="${response.result.sheets[0].data[0].rowData[i].values[j].hyperlink}" target="_blank">${rows[i][j]}</a>`
                        : rows[i][j])
                    : ''}</span>
                </div>`);
        });
        card.append(`<span class="card-index">${i + 2}</span>`);
        cardContainer.append(card);
        $('.card-list').append(cardContainer);
        cardContainer.click(async (e) => {
            if (e.target.tagName === 'A') return;
            await editRow(i + 2);
        });
    }

    if (rowsNumber < range.values.length) {
        const status = $('#status');
        status.empty();
        status.text(range.values[range.values.length - 1]
            .filter((cell, j) => !headers[j].hidden && cell !== undefined && cell !== "")
            .join(', '));
    }

    $('#filter').val('');
    $('.my-container').removeClass('edit-state');
    $('.my-container').addClass('cards-state');
}

function filterCards() {
    const filter = $('#filter').val().toLowerCase();
    if (filter === '') {
        rows.forEach((row, i) => {
            $(`#card_${i}`).removeClass('filtered');
        });
        return;
    }
    rows.map((row, i) => {
        return {
            filter: row.join(' ').toLowerCase().includes(filter),
            card: $(`#card_${i}`)
        };
    }).forEach(obj => {
        // if filtered add class 'filtered' else remove class 'filtered'
        if (obj.filter) obj.card.removeClass('filtered');
        else obj.card.addClass('filtered');
    });
}

function googleSheetsDateValueToDate(dateValue) {
    return new Date((dateValue - (25567 + 2)) * 86400 * 1000);
}

function strToInputValue(str) {
    // for example replace all " with &quot;
    return str.replace(/"/g, '&quot;');
}

/**
 * open specific row for editing in .card-edit
 */
async function editRow(rowNum) {
    let response;
    try {
        // response = await gapi.client.sheets.spreadsheets.values.get({
        //     spreadsheetId: sheetId,
        //     range: `'${sheetName}'!A${rowNum}:${lastCol}${rowNum}`
        // });
        response = await gapi.client.sheets.spreadsheets.get({
            spreadsheetId: sheetId,
            ranges: `'${sheetName}'!A${rowNum}:${lastCol}${rowNum}`,
            fields: 'sheets.data.rowData.values.userEnteredValue,sheets.data.rowData.values.effectiveFormat.numberFormat'
        });
    } catch (err) {
        document.getElementById('content').innerText = err.message;
        return;
    }
    const range = response.result.sheets[0].data[0].rowData;
    if (!range || !range[0].values || range[0].values.length == 0) {
        document.getElementById('content').innerText = 'No values found.';
        return;
    }
    editRowNum = rowNum;
    let row = range[0].values;
    // add cells to .card-edit using jquery
    $('.card-edit-list').empty();
    headers.forEach((header, j) => {
        // there are 4 options: number, date, text, formula
        const cell = row[j];
        if (cell.userEnteredValue.formulaValue !== undefined) {
            // formula
            $('.card-edit-list').append(
                `<div class="form-floating mb-3 ${header.hidden ? 'hidden' : ''}">
                    <input type="text" class="form-control" id="edit_${j}" 
                           value="${row.length > j ? strToInputValue(cell.userEnteredValue.formulaValue) : ''}" placeholder="..." >
                    <label for="edit_${j}">${header.name}</label>
                </div>`);
        } else if (cell.effectiveFormat?.numberFormat?.type === 'DATE') {
            // date
            const date = googleSheetsDateValueToDate(cell.userEnteredValue.numberValue);
            const dateValue = date.toISOString().split('T')[0];
            $('.card-edit-list').append(
                `<div class="form-floating mb-3 ${header.hidden ? 'hidden' : ''}">
                    <input type="date" class="form-control" id="edit_${j}" 
                           value="${row.length > j ? dateValue : ''}" placeholder="..." >
                    <label for="edit_${j}">${header.name}</label>
                </div>`);
            // TODO: work on date option and formats, edit and save them
        } else if (cell.userEnteredValue.numberValue !== undefined) {
            // number
            $('.card-edit-list').append(
                `<div class="form-floating mb-3 ${header.hidden ? 'hidden' : ''}">
                    <input type="number" class="form-control" id="edit_${j}" 
                           value="${row.length > j ? cell.userEnteredValue.numberValue : ''}" placeholder="..." >
                    <label for="edit_${j}">${header.name}</label>
                </div>`);
        } else {
            // text
            $('.card-edit-list').append(
                `<div class="form-floating mb-3 ${header.hidden ? 'hidden' : ''}">
                <input type="text" class="form-control" id="edit_${j}" 
                       value="${row.length > j ? strToInputValue(cell.userEnteredValue.stringValue) : ''}" placeholder="..." >
                <label for="edit_${j}">${header.name}</label>
            </div>`);
        }
    });
    $('.my-container').removeClass('cards-state');
    $('.my-container').addClass('edit-state');
}

async function saveCard() {
    let row = [];
    headers.forEach((header, j) => {
        row.push($(`#edit_${j}`).val());
    });
    row = row
        .map(cell => cell.trim());

    let response;
    try {
        if (editRowNum === -1) {
            response = await gapi.client.sheets.spreadsheets.values.append({
                spreadsheetId: sheetId,
                range: `'${sheetName}'!A1`,
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: [row],
                },
            });

        } else {
            response = await gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId: sheetId,
                range: `'${sheetName}'!A${editRowNum}:${lastCol}${editRowNum}`,
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: [row],
                },
            });
        }
    } catch (err) {
        document.getElementById('content').innerText = err.message;
        return;
    }
    await fetchRows();
}

async function cancelEdit() {
    await fetchRows();
}

async function addNew() {
    editRowNum = -1;
    let row = [];
    // add cells to .card-edit using jquery
    $('.card-edit-list').empty();
    headers.forEach((header, j) => {
        $('.card-edit-list').append(
            `<div class="form-floating mb-3">
                <input type="text" class="form-control" id="edit_${j}" 
                       value="${row.length > j ? row[j] : ''}" placeholder="..." >
                <label for="edit_${j}">${header.name}</label>
            </div>`);
    });
    $('.my-container').removeClass('cards-state');
    $('.my-container').addClass('edit-state');
}