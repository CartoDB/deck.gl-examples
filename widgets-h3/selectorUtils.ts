type DbType = 'FLOAT' | 'STRING' | 'DATE';
interface Variable {
  column_name: string;
  name: string;
  db_type: DbType;
  agg_method: string;
}

export async function initSelectors() {
  const variableSelector = document.getElementById('variable') as HTMLSelectElement;
  const data = await getVariables();
  const options = data
    .filter((variable: Variable) => ['population', 'female', 'male'].includes(variable.column_name))
    .map((variable: Variable) => {
      return `<option value="${variable.column_name}" data-agg-method="${variable.agg_method}">${variable.name}</option>`;
    });
  variableSelector.innerHTML = options.join('');
}

async function getVariables() {
  const response = await fetch(
    'https://public.carto.com/api/v4/data/observatory/metadata/datasets/cdb_spatial_fea_94e6b1f/variables?minimal=false'
  );
  return response.json();
}
