module.exports = async (
  collection,
  id,
  role,
  rules,
  otherConfig,
  populateFields = []
) => {
  const { find, property } = rules.find((rule) => rule.role === role);
  const query = { ...find, [property]: id, ...otherConfig };

  let mongooseQuery = collection.find(query);

  // Suporte a populate com campos específicos
  if (Array.isArray(populateFields)) {
    populateFields.forEach((field) => {
      mongooseQuery = mongooseQuery.populate(field);
    });
  } else if (typeof populateFields === "object" && populateFields.path) {
    mongooseQuery = mongooseQuery.populate(populateFields);
  }

  return await mongooseQuery;
};
