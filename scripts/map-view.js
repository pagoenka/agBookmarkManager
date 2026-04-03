// map-view.js
/**
 * D3.js Force-Directed Graph implementation for Knowledge Map
 */

let simulation, svg, g, zoom;
let onNodeClickCallback;

export function initGraph(svgId, onNodeClick) {
  onNodeClickCallback = onNodeClick;
  svg = d3.select(`#${svgId}`);
  const width = svg.node().parentElement.clientWidth;
  const height = svg.node().parentElement.clientHeight;

  // Clear existing
  svg.selectAll('*').remove();

  // Create main group for zooming
  g = svg.append('g').attr('class', 'main-group');

  // Setup simulation
  simulation = d3.forceSimulation()
    .force('link', d3.forceLink().id(d => d.id).distance(50).strength(0.1))
    .force('charge', d3.forceManyBody().strength(-150))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(20));

  // Zoom behavior
  zoom = d3.zoom()
    .scaleExtent([0.2, 5])
    .on('zoom', (event) => {
      g.attr('transform', event.transform);
    });

  svg.call(zoom);
}

export function updateGraph(bookmarks, clusters) {
  if (!svg || !g) return;

  const validBookmarks = bookmarks.filter(b => b.embedding && b.embedding.length > 0);
  if (validBookmarks.length === 0) return;

  // 1. Prepare Nodes & Links
  const nodes = validBookmarks.map(b => ({
    ...b,
    clusterId: findClusterId(b.id, clusters)
  }));

  const links = [];
  // Basic optimization: don't link everything to everything (O(n^2))
  // Just show strongest links per node
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      // If they are in the same cluster, definitely link them
      if (nodes[i].clusterId && nodes[i].clusterId === nodes[j].clusterId) {
          links.push({ source: nodes[i].id, target: nodes[j].id, value: 1 });
      }
    }
  }

  // 2. Render
  const colorScale = d3.scaleOrdinal(d3.schemeTableau10);

  // Links
  const link = g.selectAll('.link')
    .data(links)
    .join('line')
    .attr('class', 'link');

  // Nodes
  const node = g.selectAll('.node-group')
    .data(nodes)
    .join('g')
    .attr('class', 'node-group')
    .on('click', (event, d) => {
        if (onNodeClickCallback) onNodeClickCallback(d);
    })
    .call(drag(simulation));

  node.selectAll('circle').remove();
  node.append('circle')
    .attr('class', (d) => `node ${d.clusterId ? 'in-cluster' : ''}`)
    .attr('r', 10)
    .attr('fill', d => d.clusterId ? colorScale(d.clusterId) : '#475569');

  node.selectAll('text').remove();
  node.append('text')
    .attr('text-anchor', 'middle')
    .attr('dy', '.35em')
    .attr('fill', '#fff')
    .attr('font-size', '8px')
    .attr('font-weight', 'bold')
    .attr('pointer-events', 'none')
    .text(d => {
        try {
            const hostname = new URL(d.url).hostname.replace(/^www\./, '');
            return hostname.charAt(0).toUpperCase();
        } catch (e) {
            return '?';
        }
    });

  // Tooltips
  node.append('title').text(d => d.title);

  // Simulation step
  simulation.nodes(nodes);
  simulation.force('link').links(links);
  simulation.restart();

  simulation.on('tick', () => {
    link
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y);

    node
      .attr('transform', d => `translate(${d.x},${d.y})`);
  });
}

/**
 * Utility to find cluster ID for a bookmark ID
 */
function findClusterId(bookmarkId, clusters) {
  const cluster = clusters.find(c => c.bookmarkIds.includes(bookmarkId));
  return cluster ? cluster.id : null;
}

/**
 * Drag behavior for D3
 */
function drag(simulation) {
  function dragstarted(event) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    event.subject.fx = event.subject.x;
    event.subject.fy = event.subject.y;
  }
  
  function dragged(event) {
    event.subject.fx = event.x;
    event.subject.fy = event.y;
  }
  
  function dragended(event) {
    if (!event.active) simulation.alphaTarget(0);
    event.subject.fx = null;
    event.subject.fy = null;
  }
  
  return d3.drag()
    .on('start', dragstarted)
    .on('drag', dragged)
    .on('end', dragended);
}

// Control Exporters
export function resetZoom() {
    svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity);
}

export function zoomIn() {
    svg.transition().duration(300).call(zoom.scaleBy, 1.5);
}

export function zoomOut() {
    svg.transition().duration(300).call(zoom.scaleBy, 0.7);
}
