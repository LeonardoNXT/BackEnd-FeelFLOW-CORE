module.exports = async (collection, id, role, otherConfig, rules) => {
  const { find, property } = rules.find((rule) => rule.role === role);
  const query = { ...find, [property]: id, ...otherConfig };
  return await collection.find(query).toArray();
};
