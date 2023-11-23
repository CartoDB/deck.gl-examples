export async function initSelectors() {
    const variableSelector = document.getElementById('variable') as HTMLSelectElement;
    const data = await getVariables();
    const options = data
        .filter((variable: any) => variable.db_type === 'FLOAT')
        .map((variable: any) => {
            return `<option value="${variable.column_name}">${variable.name}</option>`;
        });
    variableSelector.innerHTML = options.join('');
}

async function getVariables() {
    const response = await fetch(
        'https://public.carto.com/api/v4/data/observatory/metadata/datasets/cdb_spatial_fea_94e6b1f/variables?minimal=true'
    );
    return response.json();
}


