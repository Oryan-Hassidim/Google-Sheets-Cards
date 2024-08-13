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
        });
    } catch (err) {
        document.getElementById('content').innerText = err.message;
        return;
    }
    sheetNames = response.result.sheets.map(sheet => sheet.properties.title);
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
    try {
        response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: sheetId,
            range: `'${sheetName}'!1:1`,
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
    headers = range.values[0];
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
    // add cards to .card-list using jquery
    $('.card-list').empty();
    rows = range.values;
    rows.forEach((row, i) => {
        let card = $(`<li class="card-container" id="card_${i}"></li>`);
        let cardContent = $(`<div class="card"></div>`);
        row.forEach((cell, j) => {
            cardContent.append(
                `<div>
                    <span>${headers[j]}</span><br>
                    <span>${cell}</span>
                </div>`);
        });
        card.append(cardContent);
        $('.card-list').append(card);
        // on click - call editRow
        card.click(async () => await editRow(i + 2));
    });
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

/**
 * open specific row for editing in .card-edit
 */
async function editRow(rowNum) {
    let response;
    try {
        response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: sheetId,
            range: `'${sheetName}'!A${rowNum}:${lastCol}${rowNum}`
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
    editRowNum = rowNum;
    let row = range.values[0];
    // add cells to .card-edit using jquery
    $('.card-edit-list').empty();
    row.forEach((cell, j) => {
        $('.card-edit-list').append(
            `<div class="form-floating mb-3">
                <input type="text" class="form-control" id="edit_${j}" value="${cell}" placeholder="..." >
                <label for="edit_${j}">${headers[j]}</label>
            </div>`);
    });
    $('.my-container').removeClass('cards-state');
    $('.my-container').addClass('edit-state');
}

async function saveCard() {
    let row = [];
    headers.forEach((header, j) => {
        row.push($(`#edit_${j}`).val());
    });
    let response;
    try {
        response = await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: sheetId,
            range: `'${sheetName}'!A${editRowNum}:${lastCol}${editRowNum}`,
            valueInputOption: 'RAW',
            resource: {
                values: [row],
            },
        });
    } catch (err) {
        document.getElementById('content').innerText = err.message;
        return;
    }
    document.getElementById('content').innerText = 'Updated row.';
    await fetchRows();
}

async function cancelEdit() {
    await fetchRows();
}

/**
 * appends row to specific sheet
 */
async function appendRow(sheetName, row) {
    let response;
    try {
        response = await gapi.client.sheets.spreadsheets.values.append({
            spreadsheetId: sheetId,
            range: `'${sheetName}'!A1`,
            valueInputOption: 'RAW',
            resource: {
                values: [row],
            },
        });
    } catch (err) {
        document.getElementById('content').innerText = err.message;
        return;
    }
    document.getElementById('content').innerText = 'Appended row.';
}