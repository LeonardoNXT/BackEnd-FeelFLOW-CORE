module.exports = (existing, userId, role, config) => {
  // procura a regra de config correspondente ao role
  const policy = config.find((c) => c.role === role);
  if (!policy) return false;

  const propertyValue = existing[policy.property];
  return propertyValue?.equals(userId);
};
