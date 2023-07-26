module.exports = {
    name2object_id(name) {
        return name.replace(/[.\s_]+/g, '_').toLowerCase().replace(/[^_\-a-z0-9]+/g, '');
    }
};
