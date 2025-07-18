let violationsData = [];
let filteredData = [];
let calendar;

document.addEventListener('DOMContentLoaded', function() {
    // Inicializa o calendário
    calendar = initCalendar();
    
    // Configura os listeners
    setupEventListeners();
    
    // Atualiza a cada minuto
    setInterval(updateStatistics, 60000);
    
    // Atualiza inicialmente
    updateStatistics();
});

function initCalendar() {
    const calendarEl = document.getElementById('calendar');
    const calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'pt-br',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay'
        },
        events: function(fetchInfo, successCallback, failureCallback) {
            const events = filteredData.map(violation => ({
                title: `${violation.driver} - ${violation.vehicle}`,
                start: `${violation.date}T${violation.time}:00`,
                extendedProps: {
                    speed: violation.speed,
                    limit: violation.limit,
                    location: violation.location
                },
                backgroundColor: violation.difference > 30 ? 'var(--danger-color)' : 'var(--warning-color)',
                borderColor: violation.difference > 30 ? 'var(--danger-color)' : 'var(--warning-color)'
            }));
            successCallback(events);
        },
        eventClick: function(info) {
            Swal.fire({
                title: 'Detalhes da Violação',
                html: `
                    <p><strong>Motorista:</strong> ${info.event.title.split(' - ')[0]}</p>
                    <p><strong>Veículo:</strong> ${info.event.title.split(' - ')[1]}</p>
                    <p><strong>Data/Hora:</strong> ${info.event.start.toLocaleString('pt-BR')}</p>
                    <p><strong>Velocidade:</strong> ${info.event.extendedProps.speed} km/h</p>
                    <p><strong>Limite:</strong> ${info.event.extendedProps.limit} km/h</p>
                    <p><strong>Diferença:</strong> ${info.event.extendedProps.speed - info.event.extendedProps.limit} km/h</p>
                    <p><strong>Local:</strong> ${info.event.extendedProps.location}</p>
                `,
                icon: 'info'
            });
        }
    });
    
    calendar.render();
    return calendar;
}

function setupEventListeners() {
    // Botão de importação
    document.getElementById('importButton').addEventListener('click', function() {
        document.getElementById('fileInput').click();
    });
    
    // Input de arquivo
    document.getElementById('fileInput').addEventListener('change', handleFileImport);
    
    // Filtros
    document.getElementById('dateRange').addEventListener('change', function() {
        document.getElementById('customDateRange').style.display = 
            this.value === 'custom' ? 'block' : 'none';
    });
    
    document.getElementById('applyFilters').addEventListener('click', applyFilters);
}

function handleFileImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(firstSheet, { defval: null });
            
            console.log("Dados brutos da planilha:", jsonData);
            
            if (!jsonData || jsonData.length === 0) {
                throw new Error("A planilha está vazia ou não contém dados válidos");
            }

            // Processa cada linha com tratamento robusto
            violationsData = jsonData.map((row, index) => {
                // Encontra automaticamente colunas relevantes
                const cols = Object.keys(row);
                const dateCol = cols.find(c => c.match(/data|date|dt/i));
                const timeCol = cols.find(c => c.match(/hora|time|hr/i));
                const driverCol = cols.find(c => c.match(/motorista|driver|condutor/i));
                const vehicleCol = cols.find(c => c.match(/veículo|veiculo|placa|vehicle|plate/i));
                const speedCol = cols.find(c => c.match(/velocidade|speed|vel/i));
                const limitCol = cols.find(c => c.match(/limite|limit|max/i));
                const locationCol = cols.find(c => c.match(/local|endereço|address|location/i));
                
                const speed = parseNumber(row[speedCol]);
                const limit = parseNumber(row[limitCol]) || 80;
                
                return {
                    id: `import-${index}-${Date.now()}`,
                    date: formatExcelDate(row[dateCol]),
                    time: formatTime(row[timeCol]),
                    driver: row[driverCol] || 'Desconhecido',
                    vehicle: row[vehicleCol] || 'Não informado',
                    speed: speed,
                    limit: limit,
                    location: row[locationCol] || 'Local não especificado',
                    difference: speed - limit
                };
            }).filter(item => {
                const isValid = item.speed > 0;
                if (!isValid) console.warn("Registro ignorado (velocidade inválida):", item);
                return isValid;
            });

            console.log("Dados processados:", violationsData);
            
            filteredData = [...violationsData];
            populateFilters();
            updateTable();
            calendar.refetchEvents();
            updateStatistics();
            
            Swal.fire({
                title: violationsData.length > 0 ? 'Importação concluída!' : 'Atenção',
                text: violationsData.length > 0 
                    ? `${violationsData.length} registros importados com sucesso.` 
                    : 'Nenhum registro válido encontrado na planilha.',
                icon: violationsData.length > 0 ? 'success' : 'warning'
            });
            
        } catch (error) {
            console.error("Erro na importação:", error);
            Swal.fire({
                title: 'Falha na importação',
                html: `Não foi possível importar os dados:<br><small>${error.message}</small>`,
                icon: 'error'
            });
        } finally {
            e.target.value = ''; // Permite reimportar o mesmo arquivo
        }
    };
    
    reader.onerror = () => {
        Swal.fire({
            title: 'Erro de leitura',
            text: 'Falha ao ler o arquivo selecionado',
            icon: 'error'
        });
    };
    
    reader.readAsArrayBuffer(file);
}

function parseNumber(value) {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        const numStr = value.replace(/[^\d.,]/g, '').replace(',', '.');
        return parseFloat(numStr) || 0;
    }
    return 0;
}

function formatExcelDate(value) {
    if (!value) return new Date().toISOString().split('T')[0];
    
    if (typeof value === 'number') {
        try {
            const date = new Date((value - (25567 + 2)) * 86400 * 1000);
            return isNaN(date.getTime()) ? new Date().toISOString().split('T')[0] : date.toISOString().split('T')[0];
        } catch {
            return new Date().toISOString().split('T')[0];
        }
    }
    
    if (typeof value === 'string') {
        const formats = [
            /(\d{2})\/(\d{2})\/(\d{4})/, // DD/MM/YYYY
            /(\d{4})-(\d{2})-(\d{2})/,   // YYYY-MM-DD
            /(\d{2})-(\d{2})-(\d{4})/,   // DD-MM-YYYY
            /(\d{4})\/(\d{2})\/(\d{2})/  // YYYY/MM/DD
        ];
        
        for (const format of formats) {
            const match = value.match(format);
            if (match) {
                if (match[1].length === 4) {
                    return `${match[1]}-${match[2]}-${match[3]}`;
                } else {
                    return `${match[3]}-${match[2]}-${match[1]}`;
                }
            }
        }
    }
    
    return new Date().toISOString().split('T')[0];
}

function formatTime(value) {
    if (!value) return '00:00';
    
    if (typeof value === 'number') {
        const totalSeconds = Math.floor(value * 24 * 60 * 60);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }
    
    if (typeof value === 'string') {
        const timeMatch = value.match(/(\d{1,2})[:h](\d{2})/);
        if (timeMatch) {
            return `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
        }
        
        const pureNumbers = value.match(/^\d{3,4}$/);
        if (pureNumbers) {
            const str = value.padStart(4, '0');
            return `${str.substr(0, 2)}:${str.substr(2, 2)}`;
        }
    }
    
    return '00:00';
}

function populateFilters() {
    const drivers = [...new Set(violationsData.map(v => v.driver))];
    const vehicles = [...new Set(violationsData.map(v => v.vehicle))];
    
    const driverSelect = document.getElementById('driverFilter');
    driverSelect.innerHTML = '<option value="all">Todos</option>';
    drivers.forEach(driver => {
        const option = document.createElement('option');
        option.value = driver;
        option.textContent = driver;
        driverSelect.appendChild(option);
    });
    
    const vehicleSelect = document.getElementById('vehicleFilter');
    vehicleSelect.innerHTML = '<option value="all">Todos</option>';
    vehicles.forEach(vehicle => {
        const option = document.createElement('option');
        option.value = vehicle;
        option.textContent = vehicle;
        vehicleSelect.appendChild(option);
    });
}

function applyFilters() {
    const dateRange = document.getElementById('dateRange').value;
    let startDate, endDate;
    
    if (dateRange === 'custom') {
        startDate = document.getElementById('startDate').value;
        endDate = document.getElementById('endDate').value;
        
        if (!startDate || !endDate) {
            Swal.fire('Atenção', 'Selecione ambas as datas para o período personalizado.', 'warning');
            return;
        }
    } else {
        const days = parseInt(dateRange);
        endDate = new Date();
        startDate = new Date();
        startDate.setDate(endDate.getDate() - days);
        
        endDate = endDate.toISOString().split('T')[0];
        startDate = startDate.toISOString().split('T')[0];
    }
    
    const driverFilter = document.getElementById('driverFilter').value;
    const vehicleFilter = document.getElementById('vehicleFilter').value;
    
    filteredData = violationsData.filter(v => {
        if (v.date < startDate || v.date > endDate) return false;
        if (driverFilter !== 'all' && v.driver !== driverFilter) return false;
        if (vehicleFilter !== 'all' && v.vehicle !== vehicleFilter) return false;
        return true;
    });
    
    updateTable();
    calendar.refetchEvents();
    updateStatistics();
    
    Swal.fire({
        title: 'Filtros aplicados',
        text: `Mostrando ${filteredData.length} notificações.`,
        icon: 'success',
        timer: 2000,
        showConfirmButton: false
    });
}

function updateTable() {
    const tableBody = document.getElementById('violationsTableBody');
    tableBody.innerHTML = '';
    
    filteredData.forEach(violation => {
        const row = document.createElement('tr');
        
        row.innerHTML = `
            <td>${new Date(violation.date).toLocaleDateString('pt-BR')}</td>
            <td>${violation.time}</td>
            <td>${violation.driver}</td>
            <td>${violation.vehicle}</td>
            <td>${violation.speed} km/h</td>
            <td>${violation.limit} km/h</td>
            <td style="color: ${violation.difference > 30 ? 'var(--danger-color)' : 'var(--warning-color)'}">
                ${violation.difference} km/h
            </td>
            <td>${violation.location}</td>
        `;
        
        tableBody.appendChild(row);
    });
}

function updateStatistics() {
    const today = new Date().toISOString().split('T')[0];
    const todayViolations = filteredData.filter(v => v.date === today).length;
    document.getElementById('todayViolations').textContent = todayViolations;
    document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString('pt-BR');
}