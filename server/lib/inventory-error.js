class InventoryError extends Error {
  constructor(message, status = 409) {
    super(message);
    this.name = 'InventoryError';
    this.status = status;
  }
}

module.exports = InventoryError;
