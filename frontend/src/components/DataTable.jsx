import styles from './DataTable.module.css';

export default function DataTable({ rows, columns }) {
  return (
    <section className={styles.panel}>
      <table>
        <thead><tr>{columns.map((column) => <th key={column}>{column.replace('_', ' ')}</th>)}</tr></thead>
        <tbody>
          {rows.map((row) => <tr key={row.id}>{columns.map((column) => <td key={column}>{row[column]}</td>)}</tr>)}
        </tbody>
      </table>
    </section>
  );
}
