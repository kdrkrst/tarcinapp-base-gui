/**
 * Dummy Dataset Repository
 *
 * Each dataset key maps to an object containing arrays of records
 * for every resource type. These are used when "Dummy Data" mode
 * is active instead of live API calls.
 *
 * To add a new dataset: copy an existing entry, give it a unique key,
 * and populate the arrays.
 */

const BASE_ENTITY = {
  _id: '',
  _kind: 'book',
  _visibility: 'public',
  _ownerUsers: ['user-001'],
  _ownerGroups: [],
  _viewerUsers: [],
  _viewerGroups: [],
  _createdDateTime: '2024-01-15T10:00:00Z',
  _lastUpdatedDateTime: '2024-03-20T14:30:00Z',
  _createdBy: 'user-001',
  _lastUpdatedBy: 'user-001',
  _validFromDateTime: '2024-01-15T10:00:00Z',
  _validUntilDateTime: null,
  _parents: [],
}

/** @type {Record<string, import('../types').DummyDataset>} */
export const DUMMY_DATASETS = {
  'library-catalog': {
    label: 'Library Catalog',
    description: 'Books, shelves, ratings and relations for a library system.',
    entities: [
      { ...BASE_ENTITY, _id: 'ent-001', _name: 'The Pragmatic Programmer', _kind: 'book', _slug: 'pragmatic-programmer' },
      { ...BASE_ENTITY, _id: 'ent-002', _name: 'Clean Code', _kind: 'book', _slug: 'clean-code' },
      { ...BASE_ENTITY, _id: 'ent-003', _name: 'Design Patterns', _kind: 'book', _slug: 'design-patterns' },
      { ...BASE_ENTITY, _id: 'ent-004', _name: 'The Phoenix Project', _kind: 'book', _slug: 'phoenix-project', _visibility: 'protected' },
      { ...BASE_ENTITY, _id: 'ent-005', _name: 'Domain-Driven Design', _kind: 'book', _slug: 'ddd' },
      { ...BASE_ENTITY, _id: 'ent-006', _name: 'Refactoring', _kind: 'book', _slug: 'refactoring', _visibility: 'private' },
    ],
    lists: [
      {
        _id: 'lst-001', _kind: 'shelf', _name: 'Software Engineering Classics', _slug: 'se-classics',
        _visibility: 'public', _ownerUsers: ['user-001'], _ownerGroups: [], _viewerUsers: [], _viewerGroups: [],
        _createdDateTime: '2024-01-10T08:00:00Z', _lastUpdatedDateTime: '2024-03-01T09:00:00Z',
        _createdBy: 'user-001', _lastUpdatedBy: 'user-001',
        _validFromDateTime: '2024-01-10T08:00:00Z', _validUntilDateTime: null, _parents: [],
      },
      {
        _id: 'lst-002', _kind: 'shelf', _name: 'DevOps Reading List', _slug: 'devops-list',
        _visibility: 'public', _ownerUsers: ['user-002'], _ownerGroups: [], _viewerUsers: [], _viewerGroups: [],
        _createdDateTime: '2024-02-01T09:00:00Z', _lastUpdatedDateTime: '2024-02-28T11:00:00Z',
        _createdBy: 'user-002', _lastUpdatedBy: 'user-002',
        _validFromDateTime: '2024-02-01T09:00:00Z', _validUntilDateTime: null, _parents: [],
      },
      {
        _id: 'lst-003', _kind: 'wishlist', _name: 'My Wishlist', _slug: 'my-wishlist',
        _visibility: 'private', _ownerUsers: ['user-001'], _ownerGroups: [], _viewerUsers: [], _viewerGroups: [],
        _createdDateTime: '2024-03-05T10:00:00Z', _lastUpdatedDateTime: '2024-04-01T10:00:00Z',
        _createdBy: 'user-001', _lastUpdatedBy: 'user-001',
        _validFromDateTime: '2024-03-05T10:00:00Z', _validUntilDateTime: null, _parents: [],
      },
    ],
    entityReactions: [
      {
        _id: 'er-001', _kind: 'rating', _entityId: 'ent-001',
        _visibility: 'public', _ownerUsers: ['user-002'], _ownerGroups: [], _viewerUsers: [], _viewerGroups: [],
        _createdDateTime: '2024-02-10T12:00:00Z', _lastUpdatedDateTime: '2024-02-10T12:00:00Z',
        _createdBy: 'user-002', _lastUpdatedBy: 'user-002',
        _validFromDateTime: '2024-02-10T12:00:00Z', _validUntilDateTime: null, _parents: [],
        score: 5,
      },
      {
        _id: 'er-002', _kind: 'rating', _entityId: 'ent-002',
        _visibility: 'public', _ownerUsers: ['user-001'], _ownerGroups: [], _viewerUsers: [], _viewerGroups: [],
        _createdDateTime: '2024-03-01T09:00:00Z', _lastUpdatedDateTime: '2024-03-01T09:00:00Z',
        _createdBy: 'user-001', _lastUpdatedBy: 'user-001',
        _validFromDateTime: '2024-03-01T09:00:00Z', _validUntilDateTime: null, _parents: [],
        score: 4,
      },
      {
        _id: 'er-003', _kind: 'bookmark', _entityId: 'ent-003',
        _visibility: 'private', _ownerUsers: ['user-001'], _ownerGroups: [], _viewerUsers: [], _viewerGroups: [],
        _createdDateTime: '2024-03-15T14:00:00Z', _lastUpdatedDateTime: '2024-03-15T14:00:00Z',
        _createdBy: 'user-001', _lastUpdatedBy: 'user-001',
        _validFromDateTime: '2024-03-15T14:00:00Z', _validUntilDateTime: null, _parents: [],
      },
    ],
    listReactions: [
      {
        _id: 'lr-001', _kind: 'like', _listId: 'lst-001',
        _visibility: 'public', _ownerUsers: ['user-003'], _ownerGroups: [], _viewerUsers: [], _viewerGroups: [],
        _createdDateTime: '2024-02-20T10:00:00Z', _lastUpdatedDateTime: '2024-02-20T10:00:00Z',
        _createdBy: 'user-003', _lastUpdatedBy: 'user-003',
        _validFromDateTime: '2024-02-20T10:00:00Z', _validUntilDateTime: null, _parents: [],
      },
      {
        _id: 'lr-002', _kind: 'follow', _listId: 'lst-002',
        _visibility: 'public', _ownerUsers: ['user-001'], _ownerGroups: [], _viewerUsers: [], _viewerGroups: [],
        _createdDateTime: '2024-03-10T11:00:00Z', _lastUpdatedDateTime: '2024-03-10T11:00:00Z',
        _createdBy: 'user-001', _lastUpdatedBy: 'user-001',
        _validFromDateTime: '2024-03-10T11:00:00Z', _validUntilDateTime: null, _parents: [],
      },
    ],
    relations: [
      {
        _id: 'rel-001', _kind: 'contains', _listId: 'lst-001', _entityId: 'ent-001',
        _createdDateTime: '2024-01-15T10:00:00Z', _lastUpdatedDateTime: '2024-01-15T10:00:00Z',
        _createdBy: 'user-001', _lastUpdatedBy: 'user-001',
        _validFromDateTime: '2024-01-15T10:00:00Z', _validUntilDateTime: null,
        _fromMetadata: {}, _toMetadata: {},
      },
      {
        _id: 'rel-002', _kind: 'contains', _listId: 'lst-001', _entityId: 'ent-002',
        _createdDateTime: '2024-01-16T10:00:00Z', _lastUpdatedDateTime: '2024-01-16T10:00:00Z',
        _createdBy: 'user-001', _lastUpdatedBy: 'user-001',
        _validFromDateTime: '2024-01-16T10:00:00Z', _validUntilDateTime: null,
        _fromMetadata: {}, _toMetadata: {},
      },
      {
        _id: 'rel-003', _kind: 'contains', _listId: 'lst-002', _entityId: 'ent-004',
        _createdDateTime: '2024-02-02T09:00:00Z', _lastUpdatedDateTime: '2024-02-02T09:00:00Z',
        _createdBy: 'user-002', _lastUpdatedBy: 'user-002',
        _validFromDateTime: '2024-02-02T09:00:00Z', _validUntilDateTime: null,
        _fromMetadata: {}, _toMetadata: {},
      },
    ],
  },

  'ecommerce-products': {
    label: 'E-Commerce Products',
    description: 'Products, categories, wishlists, and reviews for an online store.',
    entities: [
      { ...BASE_ENTITY, _id: 'ent-101', _name: 'Wireless Headphones Pro', _kind: 'product', _slug: 'wireless-headphones-pro', _visibility: 'public' },
      { ...BASE_ENTITY, _id: 'ent-102', _name: 'Mechanical Keyboard TKL', _kind: 'product', _slug: 'mechanical-keyboard-tkl', _visibility: 'public' },
      { ...BASE_ENTITY, _id: 'ent-103', _name: 'USB-C Hub 7-Port', _kind: 'product', _slug: 'usb-c-hub-7port', _visibility: 'public' },
      { ...BASE_ENTITY, _id: 'ent-104', _name: '4K Monitor 32"', _kind: 'product', _slug: '4k-monitor-32', _visibility: 'public' },
      { ...BASE_ENTITY, _id: 'ent-105', _name: 'Ergonomic Mouse', _kind: 'product', _slug: 'ergonomic-mouse', _visibility: 'protected' },
    ],
    lists: [
      {
        _id: 'lst-101', _kind: 'category', _name: 'Audio & Peripherals', _slug: 'audio-peripherals',
        _visibility: 'public', _ownerUsers: ['admin'], _ownerGroups: [], _viewerUsers: [], _viewerGroups: [],
        _createdDateTime: '2024-01-05T08:00:00Z', _lastUpdatedDateTime: '2024-01-05T08:00:00Z',
        _createdBy: 'admin', _lastUpdatedBy: 'admin',
        _validFromDateTime: '2024-01-05T08:00:00Z', _validUntilDateTime: null, _parents: [],
      },
      {
        _id: 'lst-102', _kind: 'wishlist', _name: 'Home Office Setup', _slug: 'home-office-setup',
        _visibility: 'public', _ownerUsers: ['user-001'], _ownerGroups: [], _viewerUsers: [], _viewerGroups: [],
        _createdDateTime: '2024-02-10T10:00:00Z', _lastUpdatedDateTime: '2024-02-10T10:00:00Z',
        _createdBy: 'user-001', _lastUpdatedBy: 'user-001',
        _validFromDateTime: '2024-02-10T10:00:00Z', _validUntilDateTime: null, _parents: [],
      },
    ],
    entityReactions: [
      {
        _id: 'er-101', _kind: 'review', _entityId: 'ent-101',
        _visibility: 'public', _ownerUsers: ['user-002'], _ownerGroups: [], _viewerUsers: [], _viewerGroups: [],
        _createdDateTime: '2024-03-01T09:00:00Z', _lastUpdatedDateTime: '2024-03-01T09:00:00Z',
        _createdBy: 'user-002', _lastUpdatedBy: 'user-002',
        _validFromDateTime: '2024-03-01T09:00:00Z', _validUntilDateTime: null, _parents: [],
        rating: 4, text: 'Great sound quality!',
      },
    ],
    listReactions: [],
    relations: [
      {
        _id: 'rel-101', _kind: 'belongs-to', _listId: 'lst-101', _entityId: 'ent-101',
        _createdDateTime: '2024-01-06T08:00:00Z', _lastUpdatedDateTime: '2024-01-06T08:00:00Z',
        _createdBy: 'admin', _lastUpdatedBy: 'admin',
        _validFromDateTime: '2024-01-06T08:00:00Z', _validUntilDateTime: null,
        _fromMetadata: {}, _toMetadata: {},
      },
    ],
  },
}
